using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices.JavaScript;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using CSMath;

public static class Program { public static void Main() { } }

/* The API mirrors the old writer (begin, layer, line, face, pface, pline3d, arc, circle, text, dimstyle, blk*, dim, end),
   so the app's export code stays the same. Angles come in degrees. */
public static partial class Dwg
{
    static CadDocument doc;
    static Layer cur;
    static readonly Dictionary<string, Layer> layers = new Dictionary<string, Layer>();
    static BlockRecord blk; static double blkZ; static int nBlk;
    static DimensionStyle dst;
    static double R(double deg) => deg * Math.PI / 180.0;
    static T On<T>(T e) where T : Entity { if (cur != null) e.Layer = cur; doc.Entities.Add(e); return e; }

    [JSExport] public static string Begin(int ver)
    {
        var v = ver switch { 2000 => ACadVersion.AC1015, 2007 => ACadVersion.AC1021, 2010 => ACadVersion.AC1024, 2013 => ACadVersion.AC1027, 2018 => ACadVersion.AC1032, 2004 => ACadVersion.AC1018, _ => ACadVersion.AC1027 };
        doc = new CadDocument(v); if (v < ACadVersion.AC1021) doc.Header.CodePage = "ANSI_1251"; layers.Clear(); cur = null; blk = null; nBlk = 0; dst = null; return "ok";
    }
    [JSExport] public static int Layer(string name, int color)
    {
        if (string.IsNullOrWhiteSpace(name)) name = "0";
        if (!layers.TryGetValue(name, out var l))
        {
            if (doc.Layers.TryGetValue(name, out var ex)) l = ex;
            else { l = new Layer(name); doc.Layers.Add(l); }
            l.Color = new Color((short)Math.Clamp(color, 1, 255)); layers[name] = l;
        }
        cur = l; return 0;
    }
    [JSExport] public static int Line(double x1, double y1, double z1, double x2, double y2, double z2)
    { On(new Line { StartPoint = new XYZ(x1, y1, z1), EndPoint = new XYZ(x2, y2, z2) }); return 0; }
    [JSExport] public static int Face(double[] p, int flags)
    {
        var f = new Face3D { FirstCorner = new XYZ(p[0], p[1], p[2]), SecondCorner = new XYZ(p[3], p[4], p[5]), ThirdCorner = new XYZ(p[6], p[7], p[8]), FourthCorner = new XYZ(p[9], p[10], p[11]) };
        f.Flags = (InvisibleEdgeFlags)(flags & 15); On(f); return 0;
    }
    [JSExport] public static int PFace(double[] v, int[] f)
    {
        var m = new PolyfaceMesh();
        for (int i = 0; i + 2 < v.Length; i += 3) m.Vertices.Add(new VertexFaceMesh { Location = new XYZ(v[i], v[i + 1], v[i + 2]) });
        for (int i = 0; i + 3 < f.Length; i += 4) m.Faces.Add(new VertexFaceRecord { Index1 = (short)f[i], Index2 = (short)f[i + 1], Index3 = (short)f[i + 2], Index4 = (short)f[i + 3] });
        On(m); return 0;
    }
    [JSExport] public static int Pline3d(double[] p)
    {
        if (p.Length < 6) return -1; var pl = new Polyline3D();
        for (int i = 0; i + 2 < p.Length; i += 3) pl.Vertices.Add(new Vertex3D { Location = new XYZ(p[i], p[i + 1], p[i + 2]) });
        On(pl); return 0;
    }
    [JSExport] public static int Arc(double cx, double cy, double cz, double r, double a1, double a2)
    { On(new Arc { Center = new XYZ(cx, cy, cz), Radius = r, StartAngle = R(a1), EndAngle = R(a2) }); return 0; }
    [JSExport] public static int Circle(double cx, double cy, double cz, double r)
    { On(new Circle { Center = new XYZ(cx, cy, cz), Radius = r }); return 0; }
    [JSExport] public static int Text(string s, double x, double y, double z, double h, double rot)
    { On(new TextEntity { InsertPoint = new XYZ(x, y, z), Height = h, Value = s ?? "", Rotation = R(rot) }); return 0; }
    [JSExport] public static int DimStyle(double txt, double tsz, double exo, double exe, double dle, double gap)
    {
        dst = new DimensionStyle("BIMSK") { TextHeight = txt, ArrowSize = tsz, ExtensionLineOffset = exo, ExtensionLineExtension = exe, DimensionLineGap = gap };
        doc.DimensionStyles.Add(dst); return 0;
    }
    [JSExport] public static int BlkBegin(double z) { blk = new BlockRecord("*D" + (++nBlk)); blkZ = z; return 0; }
    [JSExport] public static int BlkLine(double x1, double y1, double x2, double y2)
    { if (blk == null) return -1; var l = new Line { StartPoint = new XYZ(x1, y1, blkZ), EndPoint = new XYZ(x2, y2, blkZ) }; if (cur != null) l.Layer = cur; blk.Entities.Add(l); return 0; }
    [JSExport] public static int BlkMtext(string s, double x, double y, double h, double rot)
    { if (blk == null) return -1; var t = new MText { InsertPoint = new XYZ(x, y, blkZ), Height = h, Value = s ?? "", AlignmentPoint = new XYZ(Math.Cos(R(rot)), Math.Sin(R(rot)), 0), AttachmentPoint = AttachmentPointType.MiddleCenter }; if (cur != null) t.Layer = cur; blk.Entities.Add(t); return 0; }
    [JSExport] public static int BlkEnd() { if (blk == null) return -1; doc.BlockRecords.Add(blk); return 0; }
    [JSExport] public static int Dim(int aligned, double p1x, double p1y, double p2x, double p2y, double dpx, double dpy, double tpx, double tpy, double rot, double meas, double z)
    {
        Dimension d;
        if (aligned != 0) d = new DimensionAligned { FirstPoint = new XYZ(p1x, p1y, z), SecondPoint = new XYZ(p2x, p2y, z), DefinitionPoint = new XYZ(dpx, dpy, z), TextMiddlePoint = new XYZ(tpx, tpy, z) };
        else d = new DimensionLinear { FirstPoint = new XYZ(p1x, p1y, z), SecondPoint = new XYZ(p2x, p2y, z), DefinitionPoint = new XYZ(dpx, dpy, z), TextMiddlePoint = new XYZ(tpx, tpy, z), Rotation = R(rot) };
        if (blk != null) d.Block = blk; if (dst != null) d.Style = dst; blk = null;
        On(d); return 0;
    }
    [JSExport] public static byte[] End()
    {
        using var ms = new MemoryStream();
        using (var w = new DwgWriter(ms, doc)) { w.Write(); }
        doc = null; return ms.ToArray();
    }
    /* DWG → DXF (ASCII): the app's own DXF reader then makes the underlay */
    [JSExport] public static byte[] DwgToDxf(byte[] dwg)
    {
        using var inp = new MemoryStream(dwg);
        CadDocument d;
        using (var r = new DwgReader(inp)) { d = r.Read(); }
        using var ms = new MemoryStream();
        using (var w = new DxfWriter(ms, d, false)) { w.Write(); }
        return ms.ToArray();
    }
    [JSExport] public static string Version() => typeof(CadDocument).Assembly.GetName().Version.ToString();
}
