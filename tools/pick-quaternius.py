"""Copia os modelos escolhidos das MegaKits da Quaternius (CC0) para apps/web/public/models/q-*/
e prepara a lista de texturas a reduzir (o tools/shrink-textures.cjs faz a redução com o Electron).

Uso: python -I tools/pick-quaternius.py <pasta com x-stylized-nature-megakit, …> <apps/web/public/models>
"""
import glob
import json
import os
import shutil
import sys

SRC, DEST = sys.argv[1], sys.argv[2]

KITS = {
    'q-nature': ('x-stylized-nature-megakit', None),  # None = todos os modelos (menos as pétalas)
    'q-city': ('x-downtown-city-megakit', [
        'Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1', 'Prop_ACUnit', 'Prop_Bollard',
        'Prop_Planter_Single', 'Prop_ManholeCover', 'Prop_Drain', 'Sidewalk_Planter',
    ]),
    'q-medieval': ('x-medieval-village-megakit', [
        'Prop_Wagon', 'Prop_Crate', 'Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1', 'Prop_WoodenFence_Extension2',
        'Prop_MetalFence_Ornament', 'Prop_MetalFence_Simple', 'Prop_Vine1', 'Prop_Vine2', 'Prop_Vine4', 'Prop_Vine5', 'Prop_Vine6',
        'Prop_Vine9', 'Prop_Chimney', 'Prop_Chimney2', 'Prop_Support', 'Prop_Brick1', 'Prop_Brick2', 'Prop_Brick3', 'Prop_Brick4',
        'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Door_Round', 'Wall_Arch',
        'Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_WoodGrid',
        'Corner_Exterior_Brick', 'Corner_Exterior_Wood', 'Roof_RoundTiles_4x4', 'Roof_RoundTiles_6x6', 'Roof_Tower_RoundTiles',
        'Roof_Front_Brick4', 'Roof_Front_Brick6', 'Stairs_Exterior_Straight', 'Balcony_Simple_Straight', 'Door_1_Round',
        'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open',
    ]),
    'q-props': ('x-fantasy-props-megakit', [
        'Barrel', 'Barrel_Apples', 'Barrel_Holder', 'Bench', 'Chest_Wood', 'Crate_Wooden', 'Crate_Metal', 'Stall_Empty',
        'Stall_Cart_Empty', 'Banner_1', 'Banner_2', 'Lantern_Wall', 'Torch_Metal', 'Coin_Pile', 'Coin_Pile_2', 'FarmCrate_Apple',
        'FarmCrate_Carrot', 'Cauldron', 'Anvil', 'Workbench', 'Table_Large', 'Dummy', 'WeaponStand', 'Vase_2', 'Vase_4',
        'Pot_1', 'Bucket_Wooden_1', 'Bucket_Metal', 'Chandelier', 'CandleStick_Stand', 'CandleStick_Triple', 'Bookcase_2',
        'Shelf_Arch', 'Cage_Small', 'Chair_1', 'Stool', 'Mug', 'Key_Gold', 'Shield_Wooden', 'Rope_1',
    ]),
}

jobs = []
for out_name, (kit, wanted) in KITS.items():
    files = glob.glob(os.path.join(SRC, kit, '**', 'glTF*', '*.gltf'), recursive=True)
    by_name = {os.path.splitext(os.path.basename(f))[0]: f for f in files}
    names = sorted(n for n in by_name if not n.startswith('Petal_')) if wanted is None else wanted
    out = os.path.join(DEST, out_name)
    os.makedirs(os.path.join(out, 'tex'), exist_ok=True)
    tex_done = {}
    for name in names:
        f = by_name.get(name)
        if not f:
            print('em falta', out_name, name)
            continue
        j = json.load(open(f, encoding='utf-8'))
        d = os.path.dirname(f)
        for buf in j.get('buffers', []):
            shutil.copy(os.path.join(d, buf['uri']), os.path.join(out, os.path.basename(buf['uri'])))
            buf['uri'] = os.path.basename(buf['uri'])
        # Que imagens precisam de transparência e quais são mapas de normais/rugosidade.
        alpha_imgs, data_imgs = set(), set()
        for m in j.get('materials', []):
            pbr = m.get('pbrMetallicRoughness', {})
            base = pbr.get('baseColorTexture', {}).get('index')
            if base is not None and m.get('alphaMode', 'OPAQUE') != 'OPAQUE':
                alpha_imgs.add(j['textures'][base]['source'])
            for key in ('normalTexture', 'occlusionTexture'):
                if key in m:
                    data_imgs.add(j['textures'][m[key]['index']]['source'])
            mr = pbr.get('metallicRoughnessTexture', {}).get('index')
            if mr is not None:
                data_imgs.add(j['textures'][mr]['source'])
        for i, img in enumerate(j.get('images', [])):
            uri = img.get('uri')
            if not uri:
                continue
            base = os.path.splitext(os.path.basename(uri))[0]
            src = None
            for c in glob.glob(os.path.join(SRC, kit, '**', os.path.basename(uri)), recursive=True):
                src = c
                break
            if not src:
                print('textura em falta', uri)
                continue
            png = i in alpha_imgs
            ext = '.png' if png else '.jpg'
            new = f'tex/{base}{ext}'
            if new not in tex_done:
                size = 512 if i in data_imgs else 1024
                jobs.append({'src': os.path.abspath(src), 'dst': os.path.abspath(os.path.join(out, new)), 'size': size, 'png': png})
                tex_done[new] = True
            img['uri'] = new
            img['mimeType'] = 'image/png' if png else 'image/jpeg'
        json.dump(j, open(os.path.join(out, name + '.gltf'), 'w', encoding='utf-8'))
    lic = glob.glob(os.path.join(SRC, kit, '**', 'License*.txt'), recursive=True)
    if lic:
        shutil.copy(lic[0], os.path.join(out, 'LICENSE.txt'))
    print(out_name, len(names), 'modelos')

json.dump(jobs, open(os.path.join(DEST, '_texturas.json'), 'w'), indent=1)
print('texturas a reduzir:', len(jobs))
