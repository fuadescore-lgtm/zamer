# Обучение детектора дверей и окон на фасадах (torchvision Faster R-CNN MobileNetV3, BSD) и экспорт в ONNX.
# Данные: Door-And-Window-Detection-Dataset (YOLO-разметка). Запуск в GitHub Actions.
import os, sys, glob, time, random, yaml, torch, torchvision, numpy as np
from PIL import Image
root = sys.argv[1]; out = sys.argv[2]; epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 12
torch.set_num_threads(os.cpu_count())
yml = glob.glob(os.path.join(root, '**', '*.yaml'), recursive=True)
names = None
for y in yml:
    try:
        d = yaml.safe_load(open(y)); names = d.get('names') or names
    except Exception: pass
print('yaml', yml, 'names', names)
imgs = [p for p in glob.glob(os.path.join(root, '**', '*.*'), recursive=True) if p.lower().endswith(('.jpg', '.jpeg', '.png')) and os.sep + 'images' + os.sep in p]
def lab(p):
    l = p.replace(os.sep + 'images' + os.sep, os.sep + 'labels' + os.sep); return os.path.splitext(l)[0] + '.txt'
imgs = [p for p in imgs if os.path.exists(lab(p))]
train = [p for p in imgs if 'train' in p.lower()]; val = [p for p in imgs if ('valid' in p.lower() or 'val' + os.sep in p.lower())]; test = [p for p in imgs if 'test' in p.lower()]
if not train: random.seed(0); random.shuffle(imgs); n = int(len(imgs) * .85); train, val = imgs[:n], imgs[n:]
print('images', len(imgs), 'train', len(train), 'val', len(val), 'test', len(test))
from collections import Counter
cnt = Counter()
for p in train:
    for line in open(lab(p)):
        if line.strip(): cnt[int(line.split()[0])] += 1
print('классы в обучении', dict(cnt))
NC = max(cnt) + 1
class DS(torch.utils.data.Dataset):
    def __init__(s, L, aug): s.L, s.aug = L, aug
    def __len__(s): return len(s.L)
    def __getitem__(s, i):
        p = s.L[i]; im = Image.open(p).convert('RGB'); W, H = im.size; b, c = [], []
        for line in open(lab(p)):
            v = line.split()
            if len(v) < 5: continue
            k, x, y, w, h = int(v[0]), *map(float, v[1:5])
            if len(v) > 5:   # многоугольник → рамка
                xs = list(map(float, v[1::2])); ys = list(map(float, v[2::2])); x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            else: x0, x1, y0, y1 = x - w / 2, x + w / 2, y - h / 2, y + h / 2
            if x1 - x0 < 1e-3 or y1 - y0 < 1e-3: continue
            b.append([x0 * W, y0 * H, x1 * W, y1 * H]); c.append(k + 1)
        t = torchvision.transforms.functional.to_tensor(im)
        b = torch.tensor(b, dtype=torch.float32).reshape(-1, 4); c = torch.tensor(c, dtype=torch.int64)
        if s.aug:
            if random.random() < .5: t = t.flip(-1); b[:, [0, 2]] = W - b[:, [2, 0]]
            t = torchvision.transforms.ColorJitter(.3, .3, .3, .05)(t)
        return t, {'boxes': b, 'labels': c}
coll = lambda x: tuple(zip(*x))
m = torchvision.models.detection.fasterrcnn_mobilenet_v3_large_fpn(weights='DEFAULT', min_size=640, max_size=960)
inf = m.roi_heads.box_predictor.cls_score.in_features
m.roi_heads.box_predictor = torchvision.models.detection.faster_rcnn.FastRCNNPredictor(inf, NC + 1)
dl = torch.utils.data.DataLoader(DS(train, True), batch_size=4, shuffle=True, collate_fn=coll, num_workers=2)
opt = torch.optim.SGD([p for p in m.parameters() if p.requires_grad], lr=0.01, momentum=0.9, weight_decay=1e-4)
sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs * len(dl))
t0 = time.time(); limit = float(os.environ.get('TRAIN_SECONDS', 4.5 * 3600))
for ep in range(epochs):
    m.train(); tot = 0
    for i, (x, y) in enumerate(dl):
        loss = sum(m(list(x), list(y)).values()); opt.zero_grad(); loss.backward(); opt.step(); sch.step(); tot += loss.item()
        if i % 50 == 0: print(f'эпоха {ep} шаг {i}/{len(dl)} потеря {loss.item():.3f}  {time.time()-t0:.0f} с', flush=True)
    print(f'эпоха {ep} средняя потеря {tot/len(dl):.3f}', flush=True)
    torch.save(m.state_dict(), out + '.pt')
    if time.time() - t0 > limit: print('время вышло'); break
# быстрая проверка на отложенных: точность и полнота при IoU 0.5
m.eval(); TP = Counter(); FP = Counter(); FN = Counter()
def iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]); i = max(0, x1 - x0) * max(0, y1 - y0)
    return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i + 1e-9)
with torch.no_grad():
    for p in (val or test)[:200]:
        x, y = DS([p], False)[0]; r = m([x])[0]; keep = r['scores'] > 0.5
        pb, pl = r['boxes'][keep].tolist(), r['labels'][keep].tolist(); used = set()
        for gb, gl in zip(y['boxes'].tolist(), y['labels'].tolist()):
            j = max(range(len(pb)), key=lambda j: iou(gb, pb[j]) if pl[j] == gl and j not in used else -1, default=None)
            if j is not None and pl[j] == gl and j not in used and iou(gb, pb[j]) >= .5: TP[gl] += 1; used.add(j)
            else: FN[gl] += 1
        for j, l in enumerate(pl):
            if j not in used: FP[l] += 1
for k in sorted(set(TP) | set(FN)):
    nm = names[k - 1] if names and k - 1 < len(names) else k
    print(f'класс {nm}: точность {TP[k]/max(1,TP[k]+FP[k]):.2f}, полнота {TP[k]/max(1,TP[k]+FN[k]):.2f}')
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x): r = s.m([x[0]])[0]; return r['boxes'], r['labels'], r['scores']
torch.onnx.export(Wrap(m), torch.rand(1, 3, 640, 853), out, opset_version=17, input_names=['image'], output_names=['boxes', 'labels', 'scores'],
                  dynamic_axes={'image': {2: 'h', 3: 'w'}})
open(out + '.names.txt', 'w').write('\n'.join(map(str, names or [])))
print('saved', out, os.path.getsize(out))
