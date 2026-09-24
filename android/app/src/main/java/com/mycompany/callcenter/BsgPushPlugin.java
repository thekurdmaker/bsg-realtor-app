package com.mycompany.callcenter;

import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.onesignal.Continue;
import com.onesignal.OneSignal;
import com.onesignal.notifications.INotificationClickEvent;
import com.onesignal.notifications.INotificationClickListener;

import org.json.JSONObject;

/**
 * The web app calls this as window.Capacitor.Plugins.BsgPush:
 *   login({externalId})   -> links this phone to app_users.id (same id the server pushes to)
 *   logout()
 *   status()              -> {permission, optedIn, subscriptionId}
 *   requestPermission()   -> {granted}
 *   openSettings()        -> opens this app's notification settings
 *   event "click"         -> {data} when a notification is tapped
 */
@CapacitorPlugin(name = "BsgPush")
public class BsgPushPlugin extends Plugin {

    @Override
    public void load() {
        OneSignal.getNotifications().addClickListener(new INotificationClickListener() {
            @Override
            public void onClick(INotificationClickEvent event) {
                JSObject out = new JSObject();
                try {
                    JSONObject d = event.getNotification().getAdditionalData();
                    out.put("data", d == null ? new JSObject() : JSObject.fromJSONObject(d));
                } catch (Exception e) {
                    out.put("data", new JSObject());
                }
                notifyListeners("click", out, true);
            }
        });
    }

    @PluginMethod
    public void login(PluginCall call) {
        String id = call.getString("externalId");
        if (id == null || id.isEmpty()) {
            call.reject("externalId required");
            return;
        }
        OneSignal.login(id);
        call.resolve();
    }

    @PluginMethod
    public void logout(PluginCall call) {
        OneSignal.logout();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permission", OneSignal.getNotifications().getPermission());
        r.put("optedIn", OneSignal.getUser().getPushSubscription().getOptedIn());
        r.put("subscriptionId", OneSignal.getUser().getPushSubscription().getId());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        OneSignal.getNotifications().requestPermission(true, Continue.with(result -> {
            JSObject r = new JSObject();
            r.put("granted", result.isSuccess() && Boolean.TRUE.equals(result.getData()));
            call.resolve(r);
        }));
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
