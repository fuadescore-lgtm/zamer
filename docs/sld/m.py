from PIL import Image, ImageDraw, ImageFont
F=lambda n,b=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf' if b else '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',n)
INK=(33,37,41); BLUE=(28,126,214); GRN=(43,138,62); GREY=(73,80,87); RED=(201,42,42); PUR=(142,42,142)
class Sh:
    def __init__(s,W,H,title):
        s.im=Image.new('RGB',(W,H),'white'); s.d=ImageDraw.Draw(s.im); s.W,s.H=W,H
        s.t(title,40,24,30,True)
    def t(s,txt,x,y,sz=18,b=False,col=INK,anc='la'): s.d.text((x,y),txt,font=F(sz,b),fill=col,anchor=anc)
    def l(s,a,b,c,d,w=3,col=INK,dash=None):
        if not dash: s.d.line((a,b,c,d),fill=col,width=w); return
        import math; L=math.hypot(c-a,d-b); n=0; on=True; p=0
        while p<L:
            q=min(L,p+(dash[0] if on else dash[1]))
            if on: s.d.line((a+(c-a)*p/L,b+(d-b)*p/L,a+(c-a)*q/L,b+(d-b)*q/L),fill=col,width=w)
            p=q; on=not on
    def box(s,x,y,w,h,title,col=GREY):
        for (a,b,c,d) in [(x,y,x+w,y),(x,y+h,x+w,y+h),(x,y,x,y+h),(x+w,y,x+w,y+h)]: s.l(a,b,c,d,2,col,[12,7])
        s.t(title,x+10,y-26,20,True,col)
    def pv(s,x,y):
        s.d.rectangle((x-24,y-24,x+24,y+24),fill=(231,245,255),outline=INK,width=2); s.l(x-24,y+24,x+24,y-24,2)
    def qs(s,x,y,lab=None):
        s.l(x-40,y,x-14,y); s.l(x-14,y,x+12,y-14); s.l(x+20,y-8,x+20,y+8); s.l(x+20,y,x+40,y)
        if lab: s.t(lab,x,y-30,15,True,anc='ma')
    def qf(s,x,y,lab=None):
        s.l(x-40,y,x-14,y); s.l(x-14,y,x+12,y-14); s.d.line((x+15,y-5,x+25,y+5),fill=INK,width=2); s.d.line((x+15,y+5,x+25,y-5),fill=INK,width=2); s.l(x+20,y,x+40,y)
        if lab: s.t(lab,x,y+12,15,True,anc='ma')
    def spd(s,x,y,pe_y,lab=None):
        s.l(x,y,x,y+18); s.d.rectangle((x-10,y+18,x+10,y+48),outline=INK,width=2,fill='white'); s.l(x-5,y+24,x+5,y+42,2)
        s.l(x,y+48,x,pe_y,3,GRN)
        if lab: s.t(lab,x+14,y+26,14,True)
    def inv(s,x,y,w,h,name,sub):
        s.d.rectangle((x,y,x+w,y+h),outline=INK,width=3,fill='white'); s.l(x,y+h,x+w,y,1,(173,181,189))
        s.t('=',x+16,y+6,26,True); s.t('~',x+w-28,y+h-34,26,True); s.t(name,x+w/2,y+h/2-20,20,True,anc='mm'); s.t(sub,x+w/2,y+h/2+6,14,False,GREY,anc='mm')
    def tick(s,x,y,n): s.l(x-7,y+9,x+7,y-9,2); s.t(str(n),x+8,y+6,13,True)
    def earth(s,x,y):
        for i,(a) in enumerate([18,11,5]): s.l(x-a,y+i*7,x+a,y+i*7,2,GRN)
    def dot(s,x,y,col=INK): s.d.ellipse((x-5,y-5,x+5,y+5),fill=col)
    def pebar(s,x0,x1,y,lab): s.l(x0,y,x1,y,6,GRN); s.t(lab,x1-4,y-22,15,True,GRN,anc='ra')

def band(S,y,n,ns,kw,first,pey):
    """one inverter band: strings -> DC box section -> inverter; returns (yGRID,yLOAD, inverter bottom)"""
    xPV=110; xDB=430; wDB=330; xI=900; wI=250
    rows=[y+20+i*62 for i in range(ns)]
    S.box(xDB,y-10,wDB,62*ns+40,f'DC-бокс =QD{n}')
    for i,r in enumerate(rows):
        S.pv(xPV,r); S.t(f'С{n}.{i+1}',xPV-34,r-10,18,True,anc='ra'); S.t('10 × 410 Вт',xPV+34,r-22,14); S.l(xPV+24,r,xDB+90,r); S.tick(xDB-40,r,2)
        S.qs(xDB+130,r,f'QS{n}.{i+1}'); S.l(xDB+170,r,xI,r); S.tick(xI-40,r,2); S.t(f'MPPT {i+1}',xI-8,r-18,12,False,GREY,anc='ra')
        S.spd(xDB+215+i*45,r,y+62*ns+12)
        S.l(xPV-30,r+24,xPV-30,pey,3,GRN,[14,7]) if True else None
    S.pebar(xDB+20,xDB+wDB-20,y+62*ns+12,'PE'); S.l(xDB+40,y+62*ns+12,xDB+40,pey,3,GRN,[14,7])
    hI=max(150,62*ns+20); S.inv(xI,y-10,wI,hI,f'ИНВ-{n}',f'{kw} кВт · 3ф · {ns} MPPT')
    yG=y+20; yL=y+hI-50
    S.t('GRID',xI+wI-6,yG-16,12,True,GREY,anc='ra'); S.t('LOAD',xI+wI-6,yL-16,12,True,GREY,anc='ra')
    S.l(xI+70,y-10+hI,xI+70,pey,3,GRN,[14,7])
    return yG,yL,xI+wI

def hybrid(N,fn):
    H=380+N*250; S=Sh(2600,H,f'Однолинейная схема · {N} инвертора, параллельно (гибридные) · лист 1/1')
    pey=H-140; yb=110; xPN=1330; G=[]
    for n in range(1,N+1):
        yG,yL,xr=band(S,yb,n,2,8,n==1,pey); G.append((yG,yL,xr)); yb+=250
    # panel
    top=70; bot=pey-10; S.box(xPN,top+20,1180,bot-top-20,'Электрощит =ЩР1 (общий для всех инверторов)')
    xGb=xPN+330; xLb=xPN+560  # vertical buses
    yTop=G[0][0]; yBot=G[-1][1]
    S.l(xGb,yTop-10,xGb,G[-1][0]+10,6); S.t('шина GRID',xGb+10,yTop-36,15,True)
    S.l(xLb,G[0][1]-10,xLb,yBot+10,6); S.t('шина LOAD',xLb+10,G[0][1]-36,15,True)
    for n,(yG,yL,xr) in enumerate(G,1):
        S.l(xr,yG,xGb-120,yG); S.tick(xr+60,yG,5); S.t(f'КБ-G{n} · ВВГнг 5×10 · 3 м',xr+14,yG-26,14,False,BLUE); S.qf(xGb-80,yG,f'QF{n}.1 3P+N C25'); S.l(xGb-40,yG,xGb,yG); S.dot(xGb,yG)
        S.l(xr,yL,xLb-120,yL); S.tick(xr+60,yL,5); S.t(f'КБ-L{n} · ВВГнг 5×10 · 3 м',xr+14,yL-26,14,False,BLUE); S.qf(xLb-80,yL,f'QF{n}.2 3P+N C25'); S.l(xLb-40,yL,xLb,yL); S.dot(xLb,yL)
    # main incomer from GRID bus -> QF1 -> meter -> grid
    yM=yTop+40; S.l(xGb,yM,xPN+1000,yM); S.dot(xGb,yM); S.qf(xPN+900,yM,'QF0 3P C63'); S.l(xPN+940,yM,xPN+1180,yM)
    S.d.polygon([(xPN+1200,yM),(xPN+1180,yM-10),(xPN+1180,yM+10)],fill=INK); S.t('Сеть ~400 В',xPN+1190,yM-40,18,True,anc='ra'); S.t('через счётчик (двунапр.)',xPN+1190,yM+14,13,False,GREY,anc='ra')
    # bypass + house bus
    yS=yBot+60; S.l(xLb,yBot+10,xLb,yS); S.l(xPN+760,yM,xPN+760,yS); S.dot(xPN+760,yM)
    S.t('QS0 байпас 1-0-2 · 4P 63 А',xLb+20,yS+8,15,True); S.l(xLb,yS,xLb+100,yS+40); S.l(xPN+760,yS,xLb+100,yS+40)
    yH=yS+70; S.l(xLb+100,yS+40,xLb+100,yH); S.l(xPN+400,yH,xPN+1120,yH,6); S.t('шина дома → существующие группы',xPN+400,yH+12,14,False,GREY)
    S.spd(xPN+1060,yH,bot-40,'FV0 AC')
    S.pebar(xPN+40,xPN+1140,bot-40,'PE / ГЗШ'); S.l(xPN+100,bot-40,xPN+100,pey,3,GRN,[14,7])
    # PE line
    S.l(80,pey,xPN+100,pey,3,GRN,[14,7]); S.l(xPN+1100,bot-40,xPN+1100,pey+10,3,GRN); S.earth(xPN+1100,pey+10); S.t('заземлитель здания (контур), R ≤ 4 Ом',xPN+1060,pey+40,14,False,GRN,anc='ra')
    S.t('PE ПуГВ 1×6 мм² жёлто-зелёный · общая длина 48,2 м (рамы панелей → DC-боксы → щит, корпуса инверторов)',60,pey+40,15,False,GRN)
    # battery
    S.t(f'АКБ (общая): к каждому инвертору — свой QF DC — на листе инверторов не показано, см. ниже',60,pey+68,15,False,GREY) if False else None
    S.t(f'ИНВ-1…ИНВ-{N} работают параллельно: общие шины GRID и LOAD, один байпас, одна система PE. Каждая полоса — один инвертор со своими строками и DC-боксом.',60,H-60,15,False,GREY)
    S.t('ЭСКИЗ-ПРЕДЛОЖЕНИЕ — ещё не сделано',2560,24,18,True,RED,anc='ra')
    S.im.save(fn)

def overview(N,fn):
    W,H=2600,1100; S=Sh(W,H,f'Однолинейная схема · обзорный лист · {N} инверторов · лист 1/{N+1}')
    pey=H-190; xPN=1700; bw=360; bh=96
    y0=110; step=(pey-60-y0)/N
    xbus=xPN+260
    S.box(xPN,y0-30,850,pey-y0-20,'Электрощит =ЩР1 · AC-сборка')
    for n in range(1,N+1):
        y=y0+(n-1)*step; yc=y+bh/2
        S.d.rectangle((90,y,90+bw,y+bh),outline=INK,width=2,fill=(231,245,255)); S.t(f'Строки ИНВ-{n}: 4 стр. · 40 мод. · 16,4 кВт',100,y+10,15,True); S.t(f'скат {"ЮВЗС"[n%4]} · см. лист {n+1}',100,y+38,14,False,GREY); S.t(f'С{n}.1…С{n}.4',100,y+62,14,False,GREY)
        S.l(90+bw,yc,600,yc); S.tick(560,yc,8)
        S.d.rectangle((600,y,830,y+bh),outline=GREY,width=2); S.t(f'DC-бокс =QD{n}',715,y+bh/2-10,16,True,anc='mm'); S.t('4×QS · 4×FV',715,y+bh/2+14,13,False,GREY,anc='mm')
        S.l(830,yc,1000,yc); S.tick(960,yc,8)
        S.inv(1000,y,300,bh,f'ИНВ-{n}','15 кВт · 3ф')
        S.l(1300,yc,xbus-120,yc); S.tick(1360,yc,5); S.t(f'КБ-{n} · 5×10 · 6 м',1320,yc-24,14,False,BLUE); S.qf(xbus-80,yc,f'QF{n} 3P+N C32'); S.l(xbus-40,yc,xbus,yc); S.dot(xbus,yc)
        S.l(1000+60,y+bh,1000+60,pey,3,GRN,[14,7]); S.l(620,y+bh,620,pey,3,GRN,[14,7]); S.l(110,y+bh,110,pey,3,GRN,[14,7])
    S.l(xbus,y0,xbus,y0+(N-1)*step+bh,6); S.t('шина AC',xbus+10,y0-4,15,True)
    ym=y0+bh/2+((N-1)*step)/2; S.l(xbus,ym,xPN+850,ym); S.qf(xPN+520,ym,'QF0 3P C100'); S.d.polygon([(xPN+870,ym),(xPN+850,ym-10),(xPN+850,ym+10)],fill=INK)
    S.t('Сеть ~400 В',xPN+840,ym-40,18,True,anc='ra'); S.t('через счётчик (двунапр.)',xPN+840,ym+14,13,False,GREY,anc='ra'); S.spd(xPN+380,ym,pey-80,'FV0 AC')
    S.pebar(xPN+40,xPN+820,pey-80,'PE / ГЗШ'); S.l(xPN+100,pey-80,xPN+100,pey,3,GRN,[14,7])
    S.l(110,pey,xPN+100,pey,3,GRN,[14,7]); S.l(xPN+780,pey-80,xPN+780,pey+10,3,GRN); S.earth(xPN+780,pey+10); S.t('заземлитель здания, R ≤ 4 Ом',xPN+740,pey+40,14,False,GRN,anc='ra')
    S.t('PE ПуГВ 1×6/1×16 мм² · общая длина 132 м (рамы → DC-боксы → щит, корпуса инверторов)',60,pey+40,15,False,GRN)
    S.t(f'Обзор: каждая строка — один инвертор целиком (строки, DC-бокс, кабели, автомат). Подробно — на листах 2…{N+1}: «Однолинейная схема ИНВ-n» (как сейчас для одного инвертора).',60,H-80,15,False,GREY)
    S.t('ЭСКИЗ-ПРЕДЛОЖЕНИЕ — ещё не сделано',2560,24,18,True,RED,anc='ra')
    S.im.save(fn)
hybrid(3,'sld3.png'); overview(6,'sld6.png')
