import { invoke } from '@tauri-apps/api/core';

async function getInsets() {
    return await invoke("plugin:safe-area-insets|get_insets");
}

export { getInsets };
