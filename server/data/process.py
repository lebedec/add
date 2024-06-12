import json
import os.path
from collections import defaultdict
import shutil

import pyproj
import shutil
# примеры паттернов площадок https://leber.ru/ru/playgrounds

provider_name = {
    'Поставщик 1': 'МАФПРОЕКТ',  # https://mafproject.ru/ (так себе, есть ЗБ)
    'Поставщик 2': '',  # MBBarbell ИП Маркелов, https://mbbarbellprof.ru/ (скипаем, нет ЗБ, нет габаритов)
    'Поставщик 3': 'АлюдекоК',  # https://puntogroup.ru/
    'Поставщик 4': 'ВегаГрупп',  # https://vegagroupp.ru/
    'Поставщик 5': 'ЛЕБЕР',  # http://leber.ru/ (ЗБ, удобные чертежи, все категории)
    'Поставщик 6': 'ЕВРОМАФ',  # http://euro-maf.com/
    'Поставщик 7': 'НашДвор',  # https://nash-dvor.com/
    'Поставщик 8': '',  # скипаем, нет dwg и pdf
    'Поставщик 9': 'ФЕНИКС',  # https://xn----7sbgighmqzg3b5a.xn--p1ai/shop/outdoor/igrovye-kompleksy
    'Поставщик 10': 'ОтАдоЯ',  # https://otadoya.ru/
    'Поставщик 11': 'Хоббика',  # https://hobbyka.ru/
    'Поставщик 12': 'ЮМАГС',  # https://www.umags.ru/
    'Поставщик 13': 'ДиКом',  # https://ppkdikom.ru/ https://dikom-maf.ru/
    'Поставщик 14': 'ЗАБАВА',  # https://uh-zabava.ru/ (так себе чертежы)
    'Поставщик 15': '',  # скипаем, нет pdf
    'Поставщик 16': 'HAPPYMAF',  # https://happymaf.ru/
    'Поставщик 17': 'KENGURUPRO',  # https://kenguru.pro/ (СПОРТ)
    'Поставщик 18': 'Аданат',  # https://adanatgroup.ru/
    'Поставщик 19': '',  # скипаем, нет dwg и pdf
    'Поставщик 20': '',  # скипаем, нет dwg и pdf
}


def convert_data():
    proj_6335000 = pyproj.Proj(
        '+proj=tmerc +ellps=bessel +towgs84=316.151,78.924,589.65,-1.57273,2.69209,2.34693,8.4507 +units=m +lon_0=37.5 +lat_0=55.66666666667 +k_0=1 +x_0=0 +y_0=0')
    # pyproj.transformer.transform(proj_6335000, 'WGS84', polygon_point[0], polygon_point[1])
    transformer = pyproj.Transformer.from_proj(proj_6335000, 'epsg:4326')
    path = os.path.dirname(__file__)

    areas_path = path + '/input/Перечень площадок с АСУ ОДС, ДКР коорд.csv'
    polygons = {}
    with open(areas_path) as areas_file:
        for line in areas_file.readlines()[1:]:
            values = line.split('\t')
            if len(values) < 11 or values[0] == '':
                continue
            id = values[0]
            try:
                polygon = json.loads(values[11].strip())
            except:
                print('incorrect polygon')
                continue
            coordinates = []
            for vertex in polygon[0]:
                lat_lng = transformer.transform(*vertex)
                lat, lng = lat_lng
                coordinates.append([lng, lat])
            polygons[id] = {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coordinates]
                }
            }
    polygons_path = path + '/output/polygons.json'
    with open(polygons_path, 'w') as polygons_file:
        json.dump(polygons, polygons_file, indent=4)


def parse_providers():
    path = os.path.dirname(__file__)
    providers_path = path + '/input/Каталог 2024.tsv'
    providers_data = {}
    provider_costs = defaultdict(set)
    sizes_x = []
    sizes_y = []
    move_images = False
    with open(providers_path) as providers_file:
        for line in providers_file.readlines()[1:]:
            values = line.split('\t')

            img_uid = values[0]
            number = values[2]
            maf_cost = float(values[7])
            code_name = values[9]
            maf_type = values[10]

            try:
                maf_size = [int(v) for v in values[5].split('x')]
                size_x, size_y, size_z = maf_size
                sizes_x.append(size_x)
                sizes_y.append(size_y)
            except:
                print('error', values[5])

            name = provider_name.get(code_name)
            if not name:
                continue
            if name not in providers_data:
                providers_data[name] = {
                    'types': [],
                    'min_cost': 0.0,
                    'max_cost': 0.0
                }
            provider = providers_data[name]
            if maf_type not in provider['types']:
                provider['types'].append(maf_type)
            provider_costs[name].add(maf_cost)
            provider['min_cost'] = min(provider_costs[name])
            provider['max_cost'] = max(provider_costs[name])

            if move_images:
                src_folder = path + '/input/Каталог/картинки 2024/'
                dest_folder = path + '/output/images/' + name
                os.makedirs(dest_folder, exist_ok=True)
                img_src = src_folder + img_uid
                ext = img_uid.split('.')[-1]
                dst_name = number + '.' + ext
                img_dst = dest_folder + '/' + dst_name
                shutil.copy(img_src, img_dst)

    providers_result = path + '/output/providers.json'
    with open(providers_result, 'w') as providers_file:
        json.dump(providers_data, providers_file, indent=4, ensure_ascii=False)
    sizes_x = sorted(sizes_x)
    sizes_y = sorted(sizes_y)
    # print('sizes_x', sizes_x)
    # print('sizes_y', sizes_y)
    print(f'min: {min(sizes_x)}x{min(sizes_y)}')
    print(f'max: {max(sizes_x)}x{max(sizes_y)}')


def move_images():
    path = os.path.dirname(__file__)
    catalogs = [
        path + '/../service/data/catalog_child.json',
        path + '/../service/data/catalog_sport.json',
        path + '/../service/data/catalog_relax.json',
    ]
    output = path + '/../../web/public/preview/'
    for catalog in catalogs:
        with open(catalog) as catalog_file:
            catalog = json.load(catalog_file)
            for maf in catalog:
                img = maf['preview']
                src = path + '/input/Каталог/картинки 2024/' + img
                dst = output + img
                shutil.copy(src, dst)


if __name__ == '__main__':
    move_images()
    # parse_providers()
