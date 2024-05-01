import { PluginContext } from '../../../mol-plugin/context';
import { State, StateAction } from '../../../mol-state';
import { Task } from '../../../mol-task';
import { actionShowSegments } from '../common';
import { createLoadVolsegParams, VolsegEntryParamValues, VOLUME_NODE_TAG, SEGMENTATION_NODE_TAG, MESH_SEGMENTATION_NODE_TAG, GEOMETRIC_SEGMENTATION_NODE_TAG } from './entry-root';
import { VolsegGlobalState } from './global-state';
import { createEntryId } from './helpers';
import { VolsegGlobalStateFromRoot, VolsegEntryFromRoot, VolsegStateFromEntry, ProjectVolumeData, ProjectLatticeSegmentationDataParamsValues, ProjectSegmentationData, ProjectMeshSegmentationDataParamsValues, ProjectMeshData, ProjectGeometricSegmentationDataParamsValues, ProjectGeometricSegmentationData } from './transformers';
import { getSegmentLabelsFromDescriptions, createSegmentKey } from './volseg-api/utils';
import { PluginStateObject as SO } from '../../../mol-plugin-state/objects';

// TODO: temp change, put there 'localhost'
const DEBUGGING = typeof window !== 'undefined' ? window?.location?.hostname === 'localhost' || '127.0.0.1' : false;

export const LoadVolseg = StateAction.build({
    display: { name: 'Load New Volume & Segmentation' },
    from: SO.Root,
    params: (a, plugin: PluginContext) => {
        const res = createLoadVolsegParams(plugin, (plugin.customState as any).volsegAvailableEntries);
        return res;
    },
})(({ params, state }, ctx: PluginContext) => Task.create('Loading Volume & Segmentation', taskCtx => {
    return state.transaction(async () => {
        const entryParams = VolsegEntryParamValues.fromLoadVolsegParamValues(params);
        if (entryParams.entryId.trim().length === 0) {
            alert('Must specify Entry Id!');
            throw new Error('Specify Entry Id');
        }
        if (!entryParams.entryId.includes('-')) {
            // add source prefix if the user omitted it (e.g. 1832 -> emd-1832)
            entryParams.entryId = createEntryId(entryParams.source, entryParams.entryId);
        }
        ctx.behaviors.layout.leftPanelTabName.next('data');

        const globalStateNode = ctx.state.data.selectQ(q => q.ofType(VolsegGlobalState))[0];
        if (!globalStateNode) {
            await state.build().toRoot().apply(VolsegGlobalStateFromRoot, {}, { state: { isGhost: !DEBUGGING } }).commit();
        }

        const entryNode = await state.build().toRoot().apply(VolsegEntryFromRoot, entryParams).commit();
        await state.build().to(entryNode).apply(VolsegStateFromEntry, {}, { state: { isGhost: !DEBUGGING } }).commit();

        if (!entryNode.data) return;

        const entryData = entryNode.data;
        // const currentTimeframe = entryData.currentTimeframe.value;
        const grid = entryData.metadata.value!.raw.grid;

        const hasVolumes = grid.volumes.volume_sampling_info.spatial_downsampling_levels.length > 0;
        const hasLattices = grid.segmentation_lattices;
        const hasMeshes = grid.segmentation_meshes;
        const hasGeometricSegmentation = grid.geometric_segmentation;

        if (hasVolumes)
            await updatedChannelsData(entryNode, state);
        if (hasLattices && hasLattices.segmentation_ids.length > 0)
            await updateLatticesData(entryNode, state, hasLattices);
        if (hasMeshes && hasMeshes.segmentation_ids.length > 0)
            await updateMeshesData(entryNode, state, hasMeshes);
        // for now for a single timeframe;
        // await entryData.geometricSegmentationData.loadGeometricSegmentation(0);
        if (hasGeometricSegmentation && hasGeometricSegmentation.segmentation_ids.length > 0)
            await updateGeometricSegmentationData(entryNode, state, hasGeometricSegmentation);

        const allAnnotationsForTimeframe = entryData.metadata.value!.getAllAnnotationsForTimeframe(0);
        const allSegmentKeysForTimeframe = allAnnotationsForTimeframe.map(a => {
            return createSegmentKey(a.segment_id, a.segmentation_id, a.segment_kind);
        }
        );
        await actionShowSegments(allSegmentKeysForTimeframe, entryData);
    }).runInContext(taskCtx);
}));

async function updatedChannelsData(entryNode: any, state: State) {
    const group = await entryNode.data.volumeData.createVolumeGroup();
    const updatedChannelsData = [];
    const results = [];
    const channelIds = entryNode.data.metadata.value!.raw.grid.volumes.channel_ids;
    for (const channelId of channelIds) {
        const volumeParams = { timeframeIndex: 0, channelId: channelId };
        const volumeNode = await state.build().to(group).apply(ProjectVolumeData, volumeParams, { tags: [VOLUME_NODE_TAG] }).commit();
        const result = await entryNode.data.volumeData.createVolumeRepresentation3D(volumeNode, volumeParams);
        results.push(result);
    }
    for (const result of results) {
        if (result) {
            const isovalue = result.isovalue.kind === 'relative' ? result.isovalue.relativeValue : result.isovalue.absoluteValue;
            updatedChannelsData.push(
                { channelId: result.channelId, volumeIsovalueKind: result.isovalue.kind, volumeIsovalueValue: isovalue, volumeType: result.volumeType, volumeOpacity: result.opacity,
                    label: result.label,
                    color: result.color
                }
            );
        }
    }
    await entryNode.data.updateStateNode({ channelsData: [...updatedChannelsData] });

}

async function updateLatticesData(entryNode: any, state: State, hasLattices: any) {
    const group = await entryNode.data.latticeSegmentationData.createSegmentationGroup();
    const segmentationIds = hasLattices.segmentation_ids;
    for (const segmentationId of segmentationIds) {
        const descriptionsForLattice = entryNode.data.metadata.value!.getAllDescriptionsForSegmentationAndTimeframe(
            segmentationId,
            'lattice',
            0
        );
        const segmentLabels = getSegmentLabelsFromDescriptions(descriptionsForLattice);
        const segmentationParams: ProjectLatticeSegmentationDataParamsValues = {
            timeframeIndex: 0,
            segmentationId: segmentationId,
            segmentLabels: segmentLabels,
            ownerId: entryNode.data.ref
        };
        const segmentationNode = await state.build().to(group).apply(ProjectSegmentationData, segmentationParams, { tags: [SEGMENTATION_NODE_TAG] }).commit();
        await entryNode.data.latticeSegmentationData.createSegmentationRepresentation3D(segmentationNode, segmentationParams);
    }
}

async function updateMeshesData(entryNode: any, state: State, hasMeshes: any) {
    // meshes should be rendered as segmentation sets similar to lattices
    const group = await entryNode.data.meshSegmentationData.createMeshGroup();
    const segmentationIds = hasMeshes.segmentation_ids;
    for (const segmentationId of segmentationIds) {
        const timeframeIndex = 0;
        const meshSegmentParams = entryNode.data.meshSegmentationData.getMeshSegmentParams(segmentationId, timeframeIndex);
        const meshParams: ProjectMeshSegmentationDataParamsValues = {
            meshSegmentParams: meshSegmentParams,
            segmentationId: segmentationId,
            timeframeIndex: timeframeIndex
        };
        const meshNode = await state.build().to(group).apply(ProjectMeshData, meshParams, { tags: [MESH_SEGMENTATION_NODE_TAG] }).commit();
        await entryNode.data.meshSegmentationData.createMeshRepresentation3D(meshNode, meshParams);
    }

}

async function updateGeometricSegmentationData(entryNode: any, state: State, hasGeometricSegmentation: any) {
    const group = await entryNode.data.geometricSegmentationData.createGeometricSegmentationGroup();
    // const timeInfo = this.entryData.metadata.value!.raw.grid.geometric_segmentation!.time_info;
    for (const segmentationId of hasGeometricSegmentation.segmentation_ids) {
        const timeframeIndex = 0;
        const geometricSegmentationParams: ProjectGeometricSegmentationDataParamsValues = {
            segmentationId: segmentationId,
            timeframeIndex: timeframeIndex
        };
        const geometricSegmentationNode = await state.build().to(group).apply(ProjectGeometricSegmentationData, geometricSegmentationParams, { tags: [GEOMETRIC_SEGMENTATION_NODE_TAG] }).commit();
        await entryNode.data.geometricSegmentationData.createGeometricSegmentationRepresentation3D(geometricSegmentationNode, geometricSegmentationParams);
    }

}