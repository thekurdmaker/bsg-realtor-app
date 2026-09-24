package com.mycompany.callcenter;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BsgPushPlugin.class);   // our small native bridge to OneSignal
        super.onCreate(savedInstanceState);
    }
}
