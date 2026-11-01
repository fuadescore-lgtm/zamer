# Экспорт открытой модели поиска окон (lck1201/win_det_heatmaps, MIT; MobileNetV2) в ONNX для телефона.
# Запускается в GitHub Actions: python export_windet.py <путь к репозиторию модели> <файл ckpt> <выход.onnx>
import sys, os, copy, torch
repo, ckpt_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, repo); sys.path.insert(0, os.path.join(repo, 'common_pytorch')); sys.path.insert(0, os.path.join(repo, 'common'))
sys.argv = [sys.argv[0], '--cfg', os.path.join(repo, 'experiments/mobilenet/lr1e-3_120x90-110_center_b2.yaml')]
from common_pytorch.config_pytorch import update_config_from_file, s_config, s_config_file
from common_pytorch.blocks.mobilenetv2_pose import get_default_network_config, get_pose_net
from loss.heatmap import get_default_loss_config
cfg = copy.deepcopy(s_config); cfg.network = get_default_network_config(); cfg.loss = get_default_loss_config()
cfg = update_config_from_file(cfg, s_config_file, check_necessity=True)
net = get_pose_net(cfg.network, cfg.loss.ae_feat_dim, 4 + (1 if cfg.loss.useCenterNet else 0))
ck = torch.load(ckpt_path, map_location='cpu')
sd = ck.get('network', ck)
sd = {k.replace('module.', '', 1) if k.startswith('module.') else k: v for k, v in sd.items()}
missing, unexpected = net.load_state_dict(sd, strict=False)
print('missing', missing[:5], len(missing), 'unexpected', unexpected[:5], len(unexpected))
net.eval()
x = torch.zeros(1, 3, cfg.train.patch_height, cfg.train.patch_width)
with torch.no_grad():
    y = net(x)
print('outputs', [t.shape for t in (y if isinstance(y, (list, tuple)) else [y])])
torch.onnx.export(net, x, out, opset_version=13, input_names=['image'], do_constant_folding=True)
print('saved', out, os.path.getsize(out))
