package app.vercel.nouralqran.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NourActionReceiver extends BroadcastReceiver {
    public static final String ACTION_STOP_ATHAN = "app.vercel.nouralqran.twa.ACTION_STOP_ATHAN";
    public static final String ACTION_REFRESH_PRAYER_BAR = "app.vercel.nouralqran.twa.ACTION_REFRESH_PRAYER_BAR";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (ACTION_STOP_ATHAN.equals(action)) {
            NourNativePlugin.stopRingingAthanStatic(context, "stop");
        } else if (ACTION_REFRESH_PRAYER_BAR.equals(action)) {
            NourNativePlugin.emitPrayerAction("refresh");
        }
    }
}
