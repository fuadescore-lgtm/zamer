# Повторный экспорт детектора дверей/окон в ONNX с проверкой в onnxruntime (сравнение с PyTorch)
import sys, torch, torchvision, numpy as np, onnxruntime as ort, glob
from PIL import Image
pt, out = sys.argv[1], sys.argv[2]
m = torchvision.models.detection.fasterrcnn_mobilenet_v3_large_fpn(weights=None, weights_backbone=None, num_classes=3, min_size=640, max_size=960)
m.load_state_dict(torch.load(pt, map_location='cpu')); m.eval()
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x): r = s.m([x[0]])[0]; return r['boxes'], r['labels'], r['scores']
w = Wrap(m).eval()
imgs = sorted(glob.glob('data/**/test/images/*.jpg', recursive=True))[:3]
x0 = torchvision.transforms.functional.to_tensor(Image.open(imgs[0]).convert('RGB').resize((853, 640)))[None]
torch.onnx.export(w, x0, out, opset_version=16, input_names=['image'], output_names=['boxes', 'labels', 'scores'],
                  dynamic_axes={'image': {2: 'h', 3: 'w'}, 'boxes': {0: 'n'}, 'labels': {0: 'n'}, 'scores': {0: 'n'}}, do_constant_folding=False)
s = ort.InferenceSession(out, providers=['CPUExecutionProvider'])
for p in imgs:
    for size in [(853, 640), (640, 853), (853, 480)]:
        x = torchvision.transforms.functional.to_tensor(Image.open(p).convert('RGB').resize(size))[None]
        with torch.no_grad(): tb, tl, ts = w(x)
        ob, ol, os_ = s.run(None, {'image': x.numpy()})
        print(p.split('/')[-1][:20], size, 'torch', len(ts), 'onnx', len(os_), 'max diff', float(np.abs(np.sort(ts.numpy())[-5:] - np.sort(os_)[-5:]).max()) if len(os_) >= 5 and len(ts) >= 5 else '-')
print('ok')
