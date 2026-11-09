from m import Sh, INK, BLUE, GRN, GREY, RED, F
LG=(173,181,189)
W,H=1856,1312
S=Sh(W,H,''); d=S.d
d.rectangle((125,31,W-31,H-31),outline=INK,width=3)
sx0,sy0=W-31-820,H-31-80; d.rectangle((sx0,sy0,W-31,H-31),outline=INK,width=2)
for x in (sx0+440,sx0+640): S.l(x,sy0,x,H-31,2)
S.t('Однолинейная схема СЭС',sx0+10,sy0+12,17,True); S.t('Инверторов: 4 · АКБ · байпас',sx0+10,sy0+44,14,False,GREY)
S.t('Лист',sx0+450,sy0+10,12,False,GREY); S.t('1',sx0+450,sy0+30,20,True); S.t('Листов',sx0+650,sy0+10,12,False,GREY); S.t('1',sx0+650,sy0+30,20,True)
xPV=228; xD0=330; xD1=975; xI0=1010; xI1=1130; xP0=1345; xP1=W-45; xCol=142
xLB=1450; xGB=1590
fuX=xD0+40; busX=xD0+250; swX=xD0+300; spX0=xD0+490
top=56; slotH=262; pey=top+4*slotH+39; xPE=xP0+18
def fuse(x,y): d.rectangle((x-14,y-6,x+14,y+6),fill='white',outline=INK,width=2); S.l(x-14,y,x+14,y,2)
def qf(x,y): S.l(x-22,y,x-9,y); S.l(x-9,y,x+9,y-10); d.line((x+7,y-4,x+15,y+4),fill=INK,width=2); d.line((x+7,y+4,x+15,y-4),fill=INK,width=2); S.l(x+11,y,x+22,y)
def qs(x,y): S.l(x-22,y,x-9,y); S.l(x-9,y,x+9,y-10); S.l(x+11,y-7,x+11,y+7,2); S.l(x+11,y,x+22,y)
def spdb(x,y): d.rectangle((x-6,y,x+6,y+18),outline=INK,width=2,fill='white'); S.l(x-3,y+4,x+3,y+14,2)
def pv(x,y): d.rectangle((x-11,y-11,x+11,y+11),fill=(231,245,255),outline=INK,width=2); S.l(x-11,y+11,x+11,y-11,2)
def meter(x,y): d.rectangle((x-16,y-12,x+16,y+12),fill='white',outline=INK,width=2); S.t('Wh',x,y,11,True,anc='mm')
def tick(x,y,n): S.l(x-5,y+6,x+5,y-6,2); S.t(str(n),x+6,y-17,11,True)
def dash(a,b,c,e): S.l(a,b,c,e,2,GRN,[10,5])
def hop(x,y,x0,x1,w=3):   # horizontal line x0..x1 jumping over a vertical bus at x
    S.l(x0,y,x-9,y,w); S.l(x+9,y,x1,y,w); d.arc((x-9,y-9,x+9,y+9),180,360,fill=INK,width=w)
def frame(x,y,w,h,t,anc='ra'):
    for (a,b,c,e) in [(x,y,x+w,y),(x,y+h,x+w,y+h),(x,y,x,y+h),(x+w,y,x+w,y+h)]: S.l(a,b,c,e,2,GREY,[10,6])
    S.t(t,x+w if anc=='ra' else x,y-18,13,True,GREY,anc=anc)
slots=[(1,[2,2,2,2],False,1,'гибрид','4 MPPT, 2 входа/MPPT'),(2,[2,2,2,2],False,9,'гибрид','4 MPPT, 2 входа/MPPT'),
       (3,[2,2,2,2],False,17,'гибрид','4 MPPT, 2 входа/MPPT'),(4,[3,2,1],True,25,'сетевой','3 MPPT, 1 вход/MPPT')]
G=[]; L=[]
for k,(n,mp,par,si,kind,sub) in enumerate(slots):
    y0=top+k*slotH+24; bh=slotH-34; ybar=y0+bh-30
    frame(xD0,y0,xD1-xD0,bh,f'DC-бокс =QD{n}')
    S.t('строка 14×410 Вт',xCol+8,y0-18,11,False,GREY)
    P=27; yy=y0+20; taps=[]; ins=[]
    for m,k2 in enumerate(mp,1):
        if par and k2>1:
            ys=[yy+i*P for i in range(k2)]; ym=ys[(k2-1)//2]
            for j,ly in enumerate(ys):
                pv(xPV,ly); S.t(f'С{si}',xPV-18,ly-8,13,True,anc='ra'); si+=1
                tick(xD0-26,ly,2); S.l(xPV+11,ly,fuX-14,ly); fuse(fuX,ly); S.t(f'FU{n}.{m}.{j+1}  25 А gPV  1000 В',fuX+20,ly-17,11,True); S.l(fuX+14,ly,busX,ly)
            S.l(busX,ys[0]-5,busX,ys[-1]+5,6)
            S.l(busX,ym,swX-22,ym); qf(swX,ym); S.t(f'QF{n}.{m}  {"63" if k2>=3 else "40"} А  1000 В',swX+28,ym-17,11,True); S.l(swX+22,ym,xI0,ym); tick(xI0-26,ym,2)
            ins.append((ym,f'MPPT{m}')); taps.append((ym,f'FV{n}.{m}')); yy=ys[-1]+P+6
        else:
            ly=yy; pv(xPV,ly); S.t(f'С{si}–{si+k2-1}' if k2>1 else f'С{si}',xPV-18,ly-8,13,True,anc='ra')
            if k2>1: S.t(f'×{k2}',xPV+15,ly+2,11,True,BLUE)
            tag=f'.1–{k2}' if k2>1 else ''
            S.l(xPV+11,ly,fuX-14,ly); tick(xD0-26,ly,2*k2); fuse(fuX,ly); S.t(f'FU{n}.{m}{tag}  25 А gPV  1000 В',fuX+20,ly-17,11,True)
            S.l(fuX+14,ly,swX-22,ly); qf(swX,ly)
            S.t(f'QF{n}.{m}{tag}  20 А  1000 В',swX+28,ly-17,11,True); S.l(swX+22,ly,xI0,ly); tick(xI0-26,ly,2*k2)
            ins.append((ly,f'MPPT{m}')); taps.append((ly,f'FV{n}.{m}')); si+=k2; yy+=P
    for i,(ly,lab) in enumerate(taps):
        x=spX0+i*40; S.dot(x,ly); S.l(x,ly,x,ybar-30,2); spdb(x,ybar-30); S.l(x,ybar-12,x,ybar,2,GRN); S.t(lab,x,ybar+8,10,True,anc='ma')
    S.l(xD0+10,ybar,xD1-6,ybar,6,GRN); S.t('PE',xD0+16,ybar-20,11,True,GRN); dash(xCol+8,ybar,xD0+10,ybar); S.t('рамы панелей',xCol+10,ybar-17,10,False,GRN)
    xdp=xD1-6; S.dot(xdp,ybar,GRN)
    # inverter + its own PE drop (enclosure) to the PE trunk
    d.rectangle((xI0,y0,xI1,y0+bh),outline=INK,width=3,fill='white'); S.l(xI0,y0+bh,xI1,y0,1,LG)
    S.t('=',xI0+30,y0+bh-40,22,True); S.t('~',xI1-8,y0+bh-40,22,True,anc='ra')
    for (iy,it) in ins: S.t(it,xI0+6,iy-6,10,False,GREY)
    # PE of the inverter enclosure (and battery) -> main panel ГЗШ via collector xPE
    cx=(xI0+xI1)//2; ype=y0+bh+9
    S.dot(cx,y0+bh,GRN); S.l(cx,y0+bh,cx,ype,2,GRN); S.l(xdp,ybar,xdp,ype,2,GRN); dash(xdp,ype,xPE,ype); S.dot(cx,ype,GRN); S.dot(xPE,ype,GRN)
    if k==0: S.t('PE → ГЗШ',xP0-6,ype+5,10,True,GRN,anc='ra')
    S.t(f'ИНВ-{n}',xI1+12,y0+92,16,True); S.t(kind,xI1+12,y0+114,10,False,GREY); S.t(sub.split(', ')[0]+',',xI1+12,y0+127,10,False,GREY); S.t(sub.split(', ')[1],xI1+12,y0+140,10,False,GREY)
    if kind=='гибрид':
        yb=y0+180; xq=xI1+74; xa0,xa1=xI1+112,xP0-12
        d.rectangle((xI1-34,yb-8,xI1-3,yb+6),fill='white'); S.t('BAT',xI1-6,yb-6,10,True,GREY,anc='ra')
        S.l(xI1,yb,xq-22,yb); qf(xq,yb); S.l(xq+22,yb,xa0,yb)
        S.t(f'QF{n}.B',xq,yb+12,11,True,anc='ma'); S.t('2P 125 А 1000 В',xq+6,yb+27,10,True,anc='ma')
        S.t('2×35 3 м',xI1+6,yb-17,10,False,BLUE)
        d.rectangle((xa0,yb-26,xa1,yb+26),outline=INK,width=3,fill='white')
        bx=xa0+14; S.l(bx-6,yb-9,bx+6,yb-9,3); S.l(bx-3,yb-4,bx+3,yb-4,3); S.l(bx-6,yb+1,bx+6,yb+1,3); S.l(bx-3,yb+6,bx+3,yb+6,3)
        S.t(f'АКБ-{n}',xa0+26,yb-22,12,True); S.t('512 В',xa0+26,yb-6,10,False,GREY); S.t('30 кВт·ч',xa0+26,yb+8,10,False,GREY)
        ax=(xa0+xa1)//2; S.dot(ax,yb+26,GRN); S.l(ax,yb+26,ax,ype,2,GRN); S.dot(ax,ype,GRN)
    # AC: GRID (and LOAD for hybrids)
    yc=y0+28
    S.t('GRID',xI1-6,yc-6,10,True,anc='ra') if False else None
    tick(xI1+24,yc,5); S.t(f'КБ-{n}.1 5×25 8 м',xI1+36,yc-18,11,False,BLUE)
    xq=xGB-42
    if k>0 and kind=='гибрид' or (kind=='сетевой'): hop(xLB,yc,xI1,xq-22)
    else: S.l(xI1,yc,xq-22,yc)
    qf(xq,yc); S.t(f'QF2.{n}',xq,yc+12,11,True,anc='ma'); S.t('3P+N 125 А' if kind=='гибрид' else '3P+N 100 А',xq,yc+27,10,True,anc='ma'); S.l(xq+22,yc,xGB,yc); S.dot(xGB,yc); G.append(yc)
    S.t('GRID' if kind=='гибрид' else 'AC',xI1-6,yc-16,10,True,anc='ra') if False else None
    if kind=='гибрид':
        yl=y0+72; xl=xLB-42
        S.l(xI1,yl,xl-22,yl); tick(xI1+24,yl,5); S.t(f'КБ-{n}.2 5×25 8 м',xI1+36,yl-18,11,False,BLUE)
        qf(xl,yl); S.t(f'QF3.{n}',xl,yl+12,11,True,anc='ma'); S.t('3P+N 125 А',xl,yl+27,10,True,anc='ma'); S.l(xl+22,yl,xLB,yl); S.dot(xLB,yl); L.append(yl)
        # port names inside the inverter box (right edge)
        d.rectangle((xI1-40,yc-8,xI1-3,yc+6),fill='white'); d.rectangle((xI1-40,yl-8,xI1-3,yl+6),fill='white'); S.t('GRID',xI1-6,yc-6,10,True,GREY,anc='ra'); S.t('LOAD',xI1-6,yl-6,10,True,GREY,anc='ra')
    else:
        d.rectangle((xI1-24,yc-8,xI1-3,yc+6),fill='white'); S.t('AC',xI1-6,yc-6,10,True,GREY,anc='ra')
# panel
pTop=top+10; pBot=pey+14
for (a,b,c,e) in [(xP0,pTop,xP1,pTop),(xP0,pBot,xP1,pBot),(xP0,pTop,xP0,pBot),(xP1,pTop,xP1,pBot)]: S.l(a,b,c,e,2,GREY,[10,6])
S.t('Электрощит =ЩР1',xP1,pTop-18,13,True,GREY,anc='ra')
y1=top+24; y2=y1+slotH; y3=y2+slotH; y4=y3+slotH
yIn=y1+160; yBy=y2+160; yHs=y4+120
# GRID bus (right) and LOAD bus (left)
S.l(xGB,G[0]-22,xGB,G[-1]+22,6); S.t('шина GRID',xGB+10,G[0]-24,10,True)
S.l(xLB,L[0]-22,xLB,yHs+22,6); S.t('шина LOAD',xLB+10,L[0]-24 if False else L[0]+34,10,True) if False else S.t('шина LOAD',xLB-10,L[0]-24,10,True,anc='ra')
# incomer: network -> meter -> QF1 -> GRID bus
S.dot(xGB,yIn); S.l(xGB,yIn,xP1+6,yIn); d.polygon([(xP1+14,yIn),(xP1+2,yIn-6),(xP1+2,yIn+6)],fill=INK)
qf(xGB+95,yIn); S.t('QF1',xGB+95,yIn+12,11,True,anc='ma'); S.t('3P+N 400 А',xGB+95,yIn+27,10,True,anc='ma')
meter(xGB+170,yIn); S.t('PI1',xGB+170,yIn+16,10,True,anc='ma')
S.t('Сеть ~400 В',xP1-6,yIn-40,13,True,anc='ra')
xf=xGB+32; S.dot(xf,yIn)
S.l(xf,yIn,xf,yIn+30,2); spdb(xf,yIn+30); S.l(xf,yIn+48,xf,pey,2,GRN); S.t('FV0',xf+10,yIn+52,10,True)
# bypass between GRID and LOAD buses
S.dot(xGB,yBy); S.dot(xLB,yBy); S.l(xLB,yBy,(xLB+xGB)//2-22,yBy); qs((xLB+xGB)//2,yBy); S.l((xLB+xGB)//2+22,yBy,xGB,yBy)
S.t('QS4 байпас',(xLB+xGB)//2,yBy+12,11,True,anc='ma'); S.t('3P+N 400 А',(xLB+xGB)//2,yBy+27,10,True,anc='ma')
# house loads from LOAD bus
S.dot(xLB,yHs); xh=xf-34; S.l(xLB,yHs,xh,yHs); d.polygon([(xh+12,yHs),(xh,yHs-6),(xh,yHs+6)],fill=INK)
S.t('к нагрузкам дома',xh,yHs-22,12,True,anc='ra')
# PE
S.l(xP0+10,pey,xP1-10,pey,6,GRN); S.t('ГЗШ',xP1-14,pey-20,11,True,GRN,anc='ra')
xe=xP1-60; S.l(xe,pey,xe,pey+24,2,GRN); S.earth(xe,pey+24); S.t('заземлитель',xe-30,pey+20,10,False,GRN,anc='ra')
S.l(xPE,top+slotH-1,xPE,pey,2,GRN,[10,5]); S.dot(xPE,pey,GRN)
# compact legend: one block, 2 rows x 5
lx,ly=150,H-31-80; S.t('Условные обозначения',lx,ly,12,True)
items=[('pv','Строка панелей'),('qf','Автомат'),('qs','Выключатель-разъединитель'),('fu','Предохранитель'),('spd','УЗИП'),
       ('bus','Шина'),('me','Счётчик'),('pe','PE'),('earth','Заземлитель'),('tick','Число проводов')]
cols=[0,165,290,530,700]
for i,(kk,t) in enumerate(items):
    x=lx+cols[i%5]; y=ly+34+(i//5)*28
    if kk=='pv': pv(x+12,y)
    elif kk=='qf': qf(x+12,y)
    elif kk=='qs': qs(x+12,y)
    elif kk=='fu': fuse(x+12,y)
    elif kk=='spd': spdb(x+12,y-9)
    elif kk=='bus': S.l(x,y,x+24,y,6)
    elif kk=='me': d.rectangle((x,y-9,x+26,y+9),fill='white',outline=INK,width=2); S.t('Wh',x+13,y,9,True,anc='mm')
    elif kk=='pe': dash(x-2,y,x+26,y)
    elif kk=='earth': S.earth(x+12,y-8)
    elif kk=='tick': S.l(x,y,x+24,y,2); S.l(x+7,y+6,x+17,y-6,2)
    S.t(t,x+44,y-8,11)
S.im.save('h4b.png')
