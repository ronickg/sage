'use strict';

var core = require('@tauri-apps/api/core');

async function getInsets() {
    return await core.invoke("plugin:safe-area-insets|get_insets");
}

exports.getInsets = getInsets;
