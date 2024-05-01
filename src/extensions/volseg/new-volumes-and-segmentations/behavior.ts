import { LoadVolseg } from '.';
import { PluginBehavior } from '../../../mol-plugin/behavior';
import { PluginConfigItem } from '../../../mol-plugin/config';
import { VolsegEntryData } from './entry-root';
import { VolsegUI } from './ui';
import { DEFAULT_VOLSEG_SERVER, VolumeApiV2 } from './volseg-api/api';

// TODO: temp change, put there 'localhost'
const DEBUGGING = typeof window !== 'undefined' ? window?.location?.hostname === 'localhost' || '127.0.0.1' : false;

export const NewVolsegVolumeServerConfig = {
    // DefaultServer: new PluginConfigItem('volseg-volume-server', DEFAULT_VOLUME_SERVER_V2),
    DefaultServer: new PluginConfigItem('volseg-volume-server', DEBUGGING ? 'http://localhost:9000/v1' : DEFAULT_VOLSEG_SERVER),
};

export const NewVolseg = PluginBehavior.create<{ autoAttach: boolean, showTooltip: boolean }>({
    name: 'new-volseg',
    category: 'misc',
    display: {
        name: 'New Volseg',
        description: 'New Volseg'
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean, showTooltip: boolean }> {
        register() {
            this.ctx.state.data.actions.add(LoadVolseg);
            this.ctx.customStructureControls.set('new-volseg', VolsegUI as any);
            this.initializeEntryLists(); // do not await

            const entries = new Map<string, VolsegEntryData>();
            this.subscribeObservable(this.ctx.state.data.events.cell.created, o => {
                if (o.cell.obj instanceof VolsegEntryData) entries.set(o.ref, o.cell.obj);
            });

            this.subscribeObservable(this.ctx.state.data.events.cell.removed, o => {
                if (entries.has(o.ref)) {
                    entries.get(o.ref)!.dispose();
                    entries.delete(o.ref);
                }
            });
        }
        unregister() {
            this.ctx.state.data.actions.remove(LoadVolseg);
            this.ctx.customStructureControls.delete('new-volseg');
        }
        private async initializeEntryLists() {
            const apiUrl = this.ctx.config.get(NewVolsegVolumeServerConfig.DefaultServer) ?? DEFAULT_VOLSEG_SERVER;
            const api = new VolumeApiV2(apiUrl);
            const entryLists = await api.getEntryList(10 ** 6);
            Object.values(entryLists).forEach(l => l.sort());
            (this.ctx.customState as any).volsegAvailableEntries = entryLists;
        }
    }
});
