"""生成地球点阵数据 assets/land.txt。

数据来源：three-globe 示例图片（https://github.com/vasturiano/three-globe/tree/master/example/img，MIT 许可，
图像源自 NASA）：earth-water.png（海陆分布）、earth-night.jpg（夜间灯光）、earth-topology.png（地形高程）。

用法：python3 tools/mkland.py <three-globe/example/img 目录>
输出：每个陆地点 6 字节（纬度×100 int16、经度×100 int16、灯光 uint8、高程 uint8，最低位为海岸标记），
再以 base64 写入 assets/land.txt（artifact 不托管二进制文件）。
"""
import numpy as np
from PIL import Image, ImageFilter
import sys
src = sys.argv[1] if len(sys.argv) > 1 else 'three-globe/example/img/'
out = 'assets/'
water=np.asarray(Image.open(src+'earth-water.png').convert('L').resize((4096,2048),Image.BILINEAR)).astype(np.float32)/255
coastblur=np.asarray(Image.open(src+'earth-water.png').convert('L').resize((2048,1024),Image.BILINEAR).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)/255
nim=np.asarray(Image.open(src+'earth-night.jpg').convert('RGB')).astype(np.float32)
warm=np.clip(nim[:,:,0]-nim[:,:,2]*.75,0,255).astype(np.uint8)
night=np.asarray(Image.fromarray(warm,'L').filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)/255
elev=np.asarray(Image.open(src+'earth-topology.png').convert('L').resize((2048,1024),Image.BILINEAR)).astype(np.float32)/255
def samp(img,lat,lon):
    h,w=img.shape; x=((lon+180)/360*w).astype(int)%w; y=np.clip(((90-lat)/180*h).astype(int),0,h-1); return img[y,x]
N=180000
i=np.arange(N)+.5
y=1-2*i/N; lat=np.degrees(np.arcsin(y))
ga=np.pi*(3-np.sqrt(5)); lon=np.degrees((i*ga)%(2*np.pi))-180
land=samp(water,lat,lon)<.5
lat=lat[land]; lon=lon[land]
li=samp(night,lat,lon); li=np.clip(li/0.22,0,1)**.9
el=samp(elev,lat,lon)
co=samp(coastblur,lat,lon); coast=((co>.12)).astype(np.uint8)
print('land dots',len(lat),'lit>0.3',(li>.3).sum(),'coast',coast.sum(),'elev max',el.max())
rec=np.zeros(len(lat),dtype=[('lat','<i2'),('lon','<i2'),('li','u1'),('el','u1')])
rec['lat']=np.round(lat*100); rec['lon']=np.round(lon*100)
rec['li']=np.round(li*255); rec['el']=np.round(np.clip(el,0,1)*200+coast*0)  # elevation 0..200
rec['el']=np.where(coast==1, rec['el']|1, rec['el']&254)  # low bit = coast flag
import base64
open(out+'land.txt','w').write(base64.b64encode(rec.tobytes()).decode())
print('land.txt', len(rec), 'dots')
