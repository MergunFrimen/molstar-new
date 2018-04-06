/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import REGL = require('regl');
import { ValueCell } from 'mol-util/value-cell'

import { Renderable } from '../renderable'
import { ColorTexture } from '../util'
import { getBuffers, createTransformAttributes, fillSerial, createColorUniforms } from './util'
import Attribute from '../attribute';
import { MeshShaders } from '../shaders'

type Mesh = 'mesh'

type Uniforms = { [k: string]: REGL.Uniform | REGL.Texture }

namespace Mesh {
    export type DataType = {
        position: { type: Float32Array, itemSize: 3 }
        normal: { type: Float32Array, itemSize: 3 }
        transform: { type: Float32Array, itemSize: 16 }
        color: { type: ColorTexture, itemSize: 16 }
    }
    export type Data = { [K in keyof DataType]: DataType[K]['type'] }
    export type BoxedData = { [K in keyof Data]: ValueCell<Data[K]> }

    export function create(regl: REGL.Regl, data: BoxedData, uniforms: Uniforms, elements?: Helpers.UintArray): Renderable<Data> {
        // console.log('mesh', {
        //     count: attributes.position.getCount(),
        //     instances: attributes.transformColumn0.getCount(),
        //     attributes,
        //     uniforms
        // })
        const instanceCount = data.transform.ref.value.length / 16
        const instanceId = ValueCell.create(fillSerial(new Float32Array(instanceCount)))
        // console.log(instanceId)
        const command = regl({
            ...MeshShaders,
            uniforms: {
                objectId: uniforms.objectId || 0,
                instanceCount,
                ...createColorUniforms(regl, data.color),
                ...uniforms
            },
            attributes: getBuffers({
                instanceId: Attribute.create(regl, instanceId, { size: 1, divisor: 1 }),
                position: Attribute.create(regl, data.position, { size: 3 }),
                normal: Attribute.create(regl, data.normal, { size: 3 }),
                ...createTransformAttributes(regl, data.transform)
            }),
            elements: elements && regl.elements({
                data: new Uint16Array(elements),
                primitive: 'triangles',
                // type: 'uint16',
                // count: elements.length / 3,
                // length: elements.length * 2
            }),
            count: elements ? elements.length : data.position.ref.value.length / 3,
            instances: instanceCount,
            primitive: 'triangles'
        })
        return {
            draw: () => command(),
        }
    }
}

export default Mesh