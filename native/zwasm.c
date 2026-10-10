/* Мини-обёртка над LibreDWG: собирает DWG R2000 в памяти из простых команд. */
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include "dwg.h"
#include "dwg_api.h"
#include "bits.h"
#include "encode.h"


#ifdef __wasm__
#define KEEP __attribute__((used, visibility("default")))
#else
#define KEEP
#endif

static Dwg_Data *D = NULL;
static Dwg_Object_BLOCK_HEADER *H = NULL;
static Dwg_Object_BLOCK_HEADER *T = NULL; /* куда добавляем: модель или блок размера */
static int NDIM = 0;
static BITCODE_H DSTY = NULL;
static unsigned char *OUT = NULL;
static size_t OUTN = 0;

KEEP int zd_begin (void)
{
  if (D) { dwg_free (D); free (D); D = NULL; }
  D = dwg_new_Document (R_2000, 0, 0);
  if (!D) return -1;
  Dwg_Object *ms = dwg_model_space_object (D);
  H = ms ? ms->tio.object->tio.BLOCK_HEADER : NULL;
  T = H; NDIM = 0; DSTY = NULL;
  return H ? 0 : -2;
}

/* создать (или выбрать) слой и сделать его текущим */
KEEP int zd_layer (const char *name, int color)
{
  if (!D) return -1;
  BITCODE_H ref = dwg_find_tablehandle (D, name, "LAYER");
  unsigned long hv;
  if (ref) hv = ref->absolute_ref;
  else
    {
      Dwg_Object_LAYER *lay = dwg_add_LAYER (D, name);
      if (!lay) return -2;
      lay->color.index = (BITCODE_BS)color;
      int err = 0;
      Dwg_Object *o = dwg_obj_generic_to_object (lay, &err);
      if (!o) return -3;
      hv = o->handle.value;
    }
  D->header_vars.CLAYER = dwg_add_handleref (D, 5, hv, NULL);
  return 0;
}

KEEP int zd_line (double x1, double y1, double z1, double x2, double y2, double z2)
{
  dwg_point_3d a = { x1, y1, z1 }, b = { x2, y2, z2 };
  return dwg_add_LINE (T, &a, &b) ? 0 : -1;
}

/* 3D-грань (треугольник: 4-я точка = 3-й) — 3D модель для AutoCAD */
KEEP int zd_face (double x1, double y1, double z1, double x2, double y2, double z2,
                  double x3, double y3, double z3, double x4, double y4, double z4)
{
  dwg_point_3d a = { x1, y1, z1 }, b = { x2, y2, z2 }, c = { x3, y3, z3 }, d = { x4, y4, z4 };
  return dwg_add_3DFACE (T, &a, &b, &c, &d) ? 0 : -1;
}

KEEP int zd_circle (double cx, double cy, double cz, double r)
{
  dwg_point_3d c = { cx, cy, cz };
  return dwg_add_CIRCLE (T, &c, r) ? 0 : -1;
}

/* углы в градусах, против часовой стрелки */
KEEP int zd_arc (double cx, double cy, double cz, double r, double a1, double a2)
{
  dwg_point_3d c = { cx, cy, cz };
  return dwg_add_ARC (T, &c, r, a1 * M_PI / 180.0, a2 * M_PI / 180.0) ? 0 : -1;
}

/* текст от левого нижнего угла; rot в градусах */
KEEP int zd_text (const char *utf8, double x, double y, double z, double h, double rot)
{
  dwg_point_3d p = { x, y, z };
  Dwg_Entity_TEXT *t = dwg_add_TEXT (T, utf8, &p, h);
  if (!t) return -1;
  t->rotation = rot * M_PI / 180.0;
  t->horiz_alignment = 0;
  t->vert_alignment = 0;
  t->alignment_pt.x = 0.0;
  t->alignment_pt.y = 0.0;
  t->width_factor = 1.0;
  t->oblique_angle = 0.0;
  t->generation = 0;
  t->elevation = z;
  BITCODE_RC f = 0x02 | 0x04 | 0x10 | 0x20 | 0x40 | 0x80;
  if (z == 0.0) f |= 0x01;
  if (t->rotation == 0.0) f |= 0x08;
  t->dataflags = f;
  return 0;
}


/* объекты внутри блока размера: слой 0, цвет «ПоБлоку» — берут цвет и слой самого размера */
static void blkent (Dwg_Object_Entity *e)
{
  if (!e || T == H) return;
  BITCODE_H l0 = dwg_find_tablehandle (D, "0", "LAYER");
  if (l0) e->layer = dwg_add_handleref (D, 5, l0->absolute_ref, NULL);
  e->color.index = 0;
}
static Dwg_Object_Entity *lastent (void)
{
  Dwg_Object *o = &D->object[D->num_objects - 1];
  return o->supertype == DWG_SUPERTYPE_ENTITY ? o->tio.entity : NULL;
}

/* размерный стиль EasyCAD: засечки, текст над линией, вдоль линии, целые мм */
KEEP int zd_dimstyle (double txt, double tsz, double exo, double exe, double dle, double gap)
{
  if (!D) return -1;
  Dwg_Object_DIMSTYLE *s = dwg_add_DIMSTYLE (D, "EasyCAD");
  if (!s) return -2;
#define DS(o) \
  o->DIMSCALE = 1.0; o->DIMTXT = txt; o->DIMASZ = tsz; o->DIMTSZ = tsz; \
  o->DIMEXO = exo; o->DIMEXE = exe; o->DIMDLE = dle; o->DIMGAP = gap; \
  o->DIMDLI = txt * 2.5; o->DIMCEN = tsz; o->DIMTAD = 1; o->DIMTIH = 0; o->DIMTOH = 0; \
  o->DIMDEC = 0; o->DIMZIN = 8; o->DIMLUNIT = 2; o->DIMATFIT = 3; o->DIMLFAC = 1.0; o->DIMTFAC = 1.0
  DS (s);
  int err = 0;
  Dwg_Object *o = dwg_obj_generic_to_object (s, &err);
  if (!o) return -3;
  DSTY = dwg_add_handleref (D, 5, o->handle.value, NULL);
  D->header_vars.DIMSTYLE = dwg_add_handleref (D, 5, o->handle.value, NULL);
  { Dwg_Header_Variables *hv = &D->header_vars; DS (hv); }
#undef DS
  return 0;
}

/* начать анонимный блок *Dn для геометрии размера */
static double BZ = 0;
KEEP int zd_blk_begin (double z)
{
  BZ = z;
  if (!D) return -1;
  char nm[32];
  snprintf (nm, sizeof nm, "*D%d", ++NDIM);
  Dwg_Object_BLOCK_HEADER *b = dwg_add_BLOCK_HEADER (D, "*D") /* AutoCAD: имя записи анонимного блока — просто «*D», номер только у BLOCK */;
  if (!b) return -2;
  b->flag |= 1; b->anonymous = 1; b->explodable = 1;
  T = b;
  Dwg_Entity_BLOCK *bk = dwg_add_BLOCK (b, nm);
  if (!bk) { T = H; return -3; }
  blkent (lastent ());
  return 0;
}
KEEP int zd_blk_line (double x1, double y1, double x2, double y2)
{
  dwg_point_3d a = { x1, y1, BZ }, b = { x2, y2, BZ };
  if (!dwg_add_LINE (T, &a, &b)) return -1;
  blkent (lastent ()); return 0;
}
/* MTEXT по центру точки, rot в градусах */
KEEP int zd_blk_mtext (const char *utf8, double x, double y, double h, double rot)
{
  dwg_point_3d p = { x, y, BZ };
  Dwg_Entity_MTEXT *m = dwg_add_MTEXT (T, &p, 0.0, utf8);
  if (!m) return -1;
  double r = rot * M_PI / 180.0;
  m->x_axis_dir.x = cos (r); m->x_axis_dir.y = sin (r); m->x_axis_dir.z = 0;
  m->extrusion.x = 0; m->extrusion.y = 0; m->extrusion.z = 1;
  m->text_height = h; m->extents_height = h; m->extents_width = h * 0.8 * strlen (utf8);
  m->attachment = 5; m->flow_dir = 1; m->linespace_style = 1; m->linespace_factor = 1.0;
  blkent (lastent ()); return 0;
}
static Dwg_Object_BLOCK_HEADER *DB = NULL;
KEEP int zd_blk_end (void)
{
  if (T == H) return -1;
  if (!dwg_add_ENDBLK (T)) { T = H; return -2; }
  blkent (lastent ());
  DB = T; T = H; return 0;
}

/* сам размер: aligned=1 — параллельный, иначе повёрнутый (rot, град).
   p1,p2 — точки выносных, d — точка на размерной линии у второй выносной, t — центр текста */
KEEP int zd_dim (int aligned, double x1, double y1, double x2, double y2,
                 double dx, double dy, double tx, double ty, double rot, double meas, double z)
{
  if (!D || !DB) return -1;
  dwg_point_3d p1 = { x1, y1, z }, p2 = { x2, y2, z }, dp = { dx, dy, z }, tp = { tx, ty, z };
  Dwg_DIMENSION_common *c;
  if (aligned)
    {
      Dwg_Entity_DIMENSION_ALIGNED *a = dwg_add_DIMENSION_ALIGNED (H, &p1, &p2, &tp);
      if (!a) return -2;
      a->def_pt.x = dx; a->def_pt.y = dy; a->def_pt.z = z; a->oblique_angle = 0; c = (Dwg_DIMENSION_common *)a;
    }
  else
    {
      Dwg_Entity_DIMENSION_LINEAR *l = dwg_add_DIMENSION_LINEAR (H, &p1, &p2, &dp, rot * M_PI / 180.0);
      if (!l) return -3;
      l->oblique_angle = 0; c = (Dwg_DIMENSION_common *)l;
    }
  c->text_midpt.x = tx; c->text_midpt.y = ty; c->elevation = z;
  c->extrusion.x = 0; c->extrusion.y = 0; c->extrusion.z = 1;
  c->flag1 = 0x0b; c->flag = aligned ? 0x21 : 0x20;
  c->ins_scale.x = c->ins_scale.y = c->ins_scale.z = 1.0;
  c->attachment = 5; c->lspace_style = 1; c->lspace_factor = 1.0;
  c->act_measurement = meas;
  if (DSTY) c->dimstyle = dwg_add_handleref (D, 5, DSTY->absolute_ref, NULL);
  int err = 0;
  Dwg_Object *bo = dwg_obj_generic_to_object (DB, &err);
  if (!bo) return -4;
  c->block = dwg_add_handleref (D, 5, bo->handle.value, NULL);
  DB = NULL;
  return 0;
}

KEEP int zd_end (void)
{
  if (!D) return -1;
  { BITCODE_H l0 = dwg_find_tablehandle (D, "0", "LAYER");
    if (l0) D->header_vars.CLAYER = dwg_add_handleref (D, 5, l0->absolute_ref, NULL); }
  /* явная цепочка prev/next у всех объектов пространства модели (без nolinks):
     иначе AutoCAD видит «битую» ссылку у последнего объекта и просит RECOVER */
  for (BITCODE_BL oi = 0; oi < D->num_objects; oi++)
    {
      Dwg_Object *bo = &D->object[oi];
      if (bo->fixedtype != DWG_TYPE_BLOCK_HEADER || !bo->tio.object) continue;
      Dwg_Object_BLOCK_HEADER *B = bo->tio.object->tio.BLOCK_HEADER;
      if (!B || !B->num_owned || !B->entities) continue;
      Dwg_Object **E = (Dwg_Object **)calloc (B->num_owned, sizeof (Dwg_Object *));
      unsigned n = 0;
      for (unsigned i = 0; i < B->num_owned; i++)
        {
          Dwg_Object *o = B->entities[i] ? dwg_ref_object (D, B->entities[i]) : NULL;
          if (o && o->supertype == DWG_SUPERTYPE_ENTITY && o->tio.entity) E[n++] = o;
        }
      for (unsigned i = 0; i < n; i++)
        {
          Dwg_Object_Entity *e = E[i]->tio.entity;
          e->nolinks = 0;
          e->prev_entity = dwg_add_handleref (D, 4, i ? E[i-1]->handle.value : 0, NULL);
          e->next_entity = dwg_add_handleref (D, 4, i + 1 < n ? E[i+1]->handle.value : 0, NULL);
        }
      if (n)
        {
          B->first_entity = dwg_add_handleref (D, 4, E[0]->handle.value, NULL);
          B->last_entity = dwg_add_handleref (D, 4, E[n-1]->handle.value, NULL);
        }
      free (E);
    }
  /* AutoCAD требует, чтобы счётчик в доп. заголовке был больше всех номеров объектов */
  if (D->header_vars.HANDSEED)
    D->auxheader.HANDSEED = D->header_vars.HANDSEED->absolute_ref;
  Bit_Chain dat = { 0 };
  dat.opts = D->opts;
  dat.version = (Dwg_Version_Type)D->header.version;
  dat.from_version = (Dwg_Version_Type)D->header.from_version;
  dat.codepage = D->header.codepage;
  int err = dwg_encode (D, &dat);
  if (err >= DWG_ERR_CRITICAL) { if (dat.chain) free (dat.chain); return -err; }
  if (OUT) free (OUT);
  OUT = dat.chain;
  OUTN = dat.byte + (dat.bit ? 1 : 0);
  if (dat.size > OUTN) OUTN = dat.size;
  return (int)OUTN;
}
KEEP unsigned char *zd_buf (void) { return OUT; }
KEEP int zd_size (void) { return (int)OUTN; }
KEEP void *zd_malloc (int n) { return malloc (n); }
KEEP void zd_mfree (void *p) { free (p); }

