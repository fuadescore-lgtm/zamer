package PKG;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Компас телефона: датчик поворота (магнитометр + гироскоп), курс верха экрана от магнитного севера
@CapacitorPlugin(name = "Compass")
public class CompassPlugin extends Plugin implements SensorEventListener {
    private SensorManager sm;
    private Sensor rv;
    private final float[] r = new float[9];
    private final float[] r2 = new float[9];
    private final float[] o = new float[3];
    private long last = 0;

    @PluginMethod
    public void start(PluginCall call) {
        sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        rv = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rv == null && sm != null) rv = sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
        if (rv == null) { call.reject("no compass sensor"); return; }
        sm.registerListener(this, rv, SensorManager.SENSOR_DELAY_UI);
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (sm != null) sm.unregisterListener(this);
        call.resolve();
    }

    @Override
    protected void handleOnPause() { if (sm != null && rv != null) sm.unregisterListener(this); }

    @Override
    public void onSensorChanged(SensorEvent e) {
        long now = System.currentTimeMillis();
        if (now - last < 40) return;
        last = now;
        SensorManager.getRotationMatrixFromVector(r, e.values);
        int rot = Surface.ROTATION_0;
        try { rot = getActivity().getWindowManager().getDefaultDisplay().getRotation(); } catch (Exception ignored) {}
        int ax = SensorManager.AXIS_X, ay = SensorManager.AXIS_Y;
        if (rot == Surface.ROTATION_90) { ax = SensorManager.AXIS_Y; ay = SensorManager.AXIS_MINUS_X; }
        else if (rot == Surface.ROTATION_180) { ax = SensorManager.AXIS_MINUS_X; ay = SensorManager.AXIS_MINUS_Y; }
        else if (rot == Surface.ROTATION_270) { ax = SensorManager.AXIS_MINUS_Y; ay = SensorManager.AXIS_X; }
        SensorManager.remapCoordinateSystem(r, ax, ay, r2);
        SensorManager.getOrientation(r2, o);
        double h = Math.toDegrees(o[0]);
        if (h < 0) h += 360;
        JSObject d = new JSObject();
        d.put("heading", h);
        d.put("acc", e.accuracy);
        notifyListeners("heading", d);
    }

    @Override
    public void onAccuracyChanged(Sensor s, int a) {}
}
