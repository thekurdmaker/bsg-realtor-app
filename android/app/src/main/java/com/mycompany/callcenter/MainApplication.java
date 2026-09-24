package com.mycompany.callcenter;

import android.app.Application;

import com.onesignal.OneSignal;

/** Starts OneSignal as soon as the app process starts, so notifications work even when the app is closed. */
public class MainApplication extends Application {
    public static final String ONESIGNAL_APP_ID = "64d04a6a-e9b8-43b5-b0ab-f752e586bcb9";

    @Override
    public void onCreate() {
        super.onCreate();
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);
    }
}
