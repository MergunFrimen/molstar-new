/**
 * Copyright (c) 2024 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Aliaksei Chareshneu <chareshneu@mail.muni.cz>
 */


import { useEffect, useRef } from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { PluginComponent } from '../../../mol-plugin-state/component';
import { CollapsableControls, CollapsableState } from '../../../mol-plugin-ui/base';
import { Button, ControlRow, ExpandGroup } from '../../../mol-plugin-ui/controls/common';
import { GetAppSvg } from '../../../mol-plugin-ui/controls/icons';
import { useBehavior } from '../../../mol-plugin-ui/hooks/use-behavior';
import { PluginContext } from '../../../mol-plugin/context';
import { SimpleVolumeParamValues, SimpleVolumeParams, VolumeVisualParams } from '../new-volumes-and-segmentations/entry-volume';
import { UpdateTransformControl } from '../../../mol-plugin-ui/state/update-transform';
import { WaitingButton, WaitingParameterControls, WaitingSlider } from '../new-volumes-and-segmentations/ui';
import { sleep } from '../../../mol-util/sleep';
import { StateTransform } from '../../../mol-state/transform';
import { setSubtreeVisibility } from '../../../mol-plugin/behavior/static/state';
import { PluginCommands } from '../../../mol-plugin/commands';
import { StateTransforms } from '../../../mol-plugin-state/transforms';
import { AnnotationMetadata } from '../new-volumes-and-segmentations/volseg-api/data';

export const CVSX_VOLUME_VISUAL_TAG = 'CVSX-volume-visual';
export const CVSX_LATTICE_SEGMENTATION_VISUAL_TAG = 'CVSX-lattice-segmentation-visual';
export const CVSX_ANNOTATIONS_FILE_TAG = 'CVSX-annotations-file';

export class CSVXUI extends CollapsableControls<{}, {}> {
    protected defaultState(): CollapsableState {
        return {
            header: 'CSVS',
            isCollapsed: true,
            brand: { accent: 'cyan', svg: GetAppSvg }
        };
    }
    protected renderControls(): JSX.Element | null {
        return <CVSXFileControls plugin={this.plugin} />;
    }
}

export interface CVSXProps {
    volumes: any | undefined,
    segmentations: any | undefined,
    annotations: AnnotationMetadata | undefined,
}

// TODO: props could be volumes, segmentations, annotations
class CVSXStateModel extends PluginComponent {
    actionToggleAllSegments() {
        // TODO: first get all segment annotations
        // NOTE: assumes lattice only
        // NOTE: need to track which segment is selected
        
        // TODO: toggle all segments somehow
        // throw new Error('Method not implemented.');
    }
    state = new BehaviorSubject<{ props: CVSXProps }>({ props: { volumes: undefined, segmentations: undefined, annotations: undefined } });
    private visualTypeParamCache: { [type: string]: any } = {};

    get allDescriptions() {
        const descriptions = this.state.value.props.annotations?.descriptions;
        if (descriptions) {
            const d = [];
            const arr = Object.entries(descriptions);
            for (const obj of arr) {
                d.push(obj[1]);
            };
            return d;
        } else {
            return [];
        }
    }

    findNodesByRef(ref: string) {
        // return this.plugin.state.data.selectQ(q => q.byRef(ref).subtree())[0];
        return this.plugin.state.data.selectQ(q => q.byRef(ref).subtree())[0];
    }

    findNodesByTags(...tags: string[]) {
        return this.plugin.state.data.selectQ(q => {
            let builder = q.root.subtree();
            for (const tag of tags) builder = builder.withTag(tag);
            return builder;
        });
    }

    mount() {
        // Probably update state here as well
        const volumeVisualNodes = this.findNodesByTags(CVSX_VOLUME_VISUAL_TAG);
        const latticeSegmentationVisualNodes = this.findNodesByTags(CVSX_LATTICE_SEGMENTATION_VISUAL_TAG);
        const annotationNode = this.findNodesByTags(CVSX_ANNOTATIONS_FILE_TAG);
        const annotations = JSON.parse(annotationNode[0]!.obj!.data);
        this.state.next({
            props: {
                volumes: volumeVisualNodes,
                segmentations: latticeSegmentationVisualNodes,
                annotations: annotations
            }
        });
        console.log('state');
        console.log(this.state.value);
        const obs = combineLatest([
            this.plugin.behaviors.state.isBusy,
            this.plugin.state.data.events.cell.stateUpdated
        ]);
        this.subscribe(obs, ([busy, cell]) => {
            if (busy) return;
            // TODO:
            // 1. query state tree for volume visuals
            const volumeVisualNodes = this.findNodesByTags(CVSX_VOLUME_VISUAL_TAG);
            const latticeSegmentationVisualNodes = this.findNodesByTags(CVSX_LATTICE_SEGMENTATION_VISUAL_TAG);
            // TODO: make it not annotationNode, but annotation data
            const annotationNode = this.findNodesByTags(CVSX_ANNOTATIONS_FILE_TAG);
            const annotations = JSON.parse(annotationNode[0]!.obj!.data);
            // volumeVisualNodes[0].transform.ref
            // we need them to initialize Volume Controls in right panel
            // (volume channel controls)



            // 2. query state tree for segmentation visuals
            // somehow get annotations too

            // similar to "standard" extension
            // query state tree for all relevant info
            this.state.next({
                props: {
                    volumes: volumeVisualNodes,
                    segmentations: latticeSegmentationVisualNodes,
                    annotations: annotations
                }
            });
        });
    }

    changeColor(volumeSelector: any, newColor: any) {
        // trigger state upadte
    }

    doSomething = () => {

    };

    // NOTE: currently works for all segmentations at once
    updateSegmentationOpacity = async (opacity: number) => {
        const reprs = this.state.value.props.segmentations;
        const update = this.plugin.build().toRoot();
        console.log(reprs);
        for (const s of reprs) {
            update.to(s).update(StateTransforms.Representation.VolumeRepresentation3D, p => { p.type.params.alpha = opacity; });
        }
        return await update.commit();
    };

    updateVolumeVisual = async (newParams: SimpleVolumeParamValues, transform: StateTransform) => {
        const { volumeType, opacity } = newParams;
        const visual = this.findNodesByRef(transform.ref);
        if (!visual) return;
        const oldVisualParams: VolumeVisualParams = visual.transform.params;
        this.visualTypeParamCache[oldVisualParams.type.name] = oldVisualParams.type.params;

        if (volumeType === 'off') {
            setSubtreeVisibility(this.plugin.state.data, visual.transform.ref, true); // true means hide, ¯\_(ツ)_/¯
        } else {
            setSubtreeVisibility(this.plugin.state.data, visual.transform.ref, false); // true means hide, ¯\_(ツ)_/¯
            const newVisualParams: VolumeVisualParams = {
                ...oldVisualParams,
                type: {
                    name: volumeType,
                    params: this.visualTypeParamCache[volumeType] ?? oldVisualParams.type.params,
                }
            };
            newVisualParams.type.params.alpha = opacity;
            const volumeStats = visual.obj?.data.sourceData.grid.stats;
            if (!volumeStats) throw new Error(`Cannot get volume stats from volume visual ${visual.transform.ref}`);
            // this.changeIsovalueInVolumeVisualParams(newVisualParams, undefined, volumeStats);
            const update = this.plugin.build().toRoot().to(visual.transform.ref).update(newVisualParams);
            await PluginCommands.State.Update(this.plugin, { state: this.plugin.state.data, tree: update, options: { doNotUpdateCurrent: true } });
        }
    };

    constructor(public plugin: PluginContext) {
        super();
    }
}

function CVSXFileControls({ plugin }: { plugin: PluginContext }) {
    const _model = useRef<CVSXStateModel>();
    if (!_model.current) {
        _model.current = new CVSXStateModel(plugin);
    }
    const model = _model.current;
    useEffect(() => {
        model.mount();
        return () => model.dispose();
    }, [model]);

    const state = useBehavior(model.state);
    const isBusy = useBehavior(plugin.behaviors.state.isBusy);
    const props = state.props;

    const descriptions = props.annotations?.descriptions;
    const allDescriptions = model.allDescriptions;


    return <>
        disabled: {isBusy}
        {/* TODO: create props first */}
        {/* {state.props} */}
        {/* TODO: here render UI based on props */}
        {/* check how volume controls are rendered in volseg ui */}
        <>
            {props.volumes && <ExpandGroup header='Volume data' initiallyExpanded>
                {props.volumes.map(v => {
                    console.log('v', v);
                    const transform = v.transform;
                    if (!transform) return null;
                    const volumeValues: SimpleVolumeParamValues = {
                        volumeType: transform.state.isHidden ? 'off' : transform.params?.type.name as any,
                        opacity: transform.params?.type.params.alpha,
                    };
                    return <div key={v.transform.ref}>
                        <WaitingParameterControls params={SimpleVolumeParams} values={volumeValues} onChangeValues={async next => { await sleep(20); await model.updateVolumeVisual(next, transform) }} />
                        <UpdateTransformControl state={plugin.state.data} transform={transform} customHeader='none' />
                    </div>;

                })}
            </ExpandGroup>}
            {props.segmentations && <ExpandGroup header='Segmentation data' initiallyExpanded>
                {props.segmentations.map(s => {
                    // Opacity of segmentation can get from its visual
                    return <ControlRow key={s.transform.ref} label='Opacity' control={
                        <WaitingSlider min={0} max={1} value={s.transform.params.type.params.alpha} step={0.05} onChange={async v => await model.updateSegmentationOpacity(v)} />
                    } />;
                })}
            </ExpandGroup>}
        </>


        <Button onClick={model.doSomething}>Do something</Button>
        {/* <Button onClick={() => {const n = model.findNodesByTags(CVSX_VOLUME_TAG); console.log('NODES'); console.log(n)}}>Find nodes by Tag</Button> */}
    </>;
}
