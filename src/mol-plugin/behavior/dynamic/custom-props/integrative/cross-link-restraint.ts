/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginBehavior } from '../../../behavior';
import { ModelCrossLinkRestraint } from '../../../../../mol-model-props/integrative/cross-link-restraint/format';
import { Model } from '../../../../../mol-model/structure';
import { MmcifFormat } from '../../../../../mol-model-formats/structure/mmcif';
import { CrossLinkRestraintRepresentationProvider } from '../../../../../mol-model-props/integrative/cross-link-restraint/representation';
import { CrossLinkColorThemeProvider } from '../../../../../mol-model-props/integrative/cross-link-restraint/color';
import { CrossLinkRestraint as _CrossLinkRestraint } from '../../../../../mol-model-props/integrative/cross-link-restraint/property';

const Tag = _CrossLinkRestraint.Tag

export const CrossLinkRestraint = PluginBehavior.create<{ }>({
    name: 'integrative-cross-link-restraint',
    category: 'custom-props',
    display: { name: 'Cross Link Restraint' },
    ctor: class extends PluginBehavior.Handler<{ }> {
        private provider = ModelCrossLinkRestraint.Provider

        register(): void {
            this.provider.formatRegistry.add('mmCIF', crossLinkRestraintFromMmcif)

            this.ctx.structureRepresentation.themeCtx.colorThemeRegistry.add(Tag.CrossLinkRestraint, CrossLinkColorThemeProvider)
            this.ctx.structureRepresentation.registry.add(Tag.CrossLinkRestraint, CrossLinkRestraintRepresentationProvider)
        }

        unregister() {
            this.provider.formatRegistry.remove('mmCIF')

            this.ctx.structureRepresentation.themeCtx.colorThemeRegistry.remove(Tag.CrossLinkRestraint)
            this.ctx.structureRepresentation.registry.remove(Tag.CrossLinkRestraint)
        }
    }
});

function crossLinkRestraintFromMmcif(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return;
    const { ihm_cross_link_restraint } = model.sourceData.data.db;
    if (ihm_cross_link_restraint._rowCount === 0) return;
    return ModelCrossLinkRestraint.fromTable(ihm_cross_link_restraint, model)
}