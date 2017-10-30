/**
 * Copyright (c) 2017 molio contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import * as Data from './data-model'
import Column, { createAndFillArray } from '../../../mol-base/collections/column'

/**
 * A schema defines the shape of categories and fields.
 *
 * @example:
 * const atom_site = {
 *   '@alias': '_atom_site',
 *   label_atom_id: Field.str(),
 *   Cartn_x: Field.float(),
 *   Cartn_y: Field.float(),
 *   Cartn_z: Field.float(),
 * }
 *
 * const mmCIF = { atom_site };
 */

//////////////////////////////////////////////

export function toTypedFrame<Schema extends FrameSchema, Frame extends TypedFrame<Schema> = TypedFrame<Schema>>(schema: Schema, frame: Data.Frame): Frame {
    return createTypedFrame(schema, frame) as Frame;
}

export function toTypedCategory<Schema extends CategorySchema>(schema: Schema, category: Data.Category): TypedCategory<Schema> {
    return new _TypedCategory(category, schema, true) as TypedCategory<any>;
}

export type FrameSchema = { [category: string]: CategorySchema }
export type TypedFrameShape<Schema extends FrameSchema> = { [C in keyof Schema]: TypedCategoryShape<Schema[C]> }
export type TypedFrame<Schema extends FrameSchema> = {
    readonly _header?: string,
    readonly _frame: Data.Frame
} & { [C in keyof Schema]: TypedCategory<Schema[C]> }

export type CategorySchema = { [field: string]: Field.Schema<any> }
export type TypedCategoryShape<Schema extends CategorySchema> = { [F in keyof Schema]: Column<Schema[F]['T']> }
export type TypedCategory<Schema extends CategorySchema> = {
    readonly _rowCount: number,
    readonly _isDefined: boolean,
    readonly _category: Data.Category
} & { [F in keyof Schema]: Column<Schema[F]['T']> }

export namespace Field {
    export interface Schema<T> { T: T, ctor: (field: Data.Field, category: Data.Category, key: string) => Column<T>, undefinedField: (c: number) => Data.Field, alias?: string };
    export interface Spec { undefinedField?: (c: number) => Data.Field, alias?: string }

    export function alias(name: string): Schema<any> { return { alias: name } as any; }
    export function str(spec?: Spec) { return createSchema(spec, Str); }
    export function int(spec?: Spec) { return createSchema(spec, Int); }
    export function float(spec?: Spec) { return createSchema(spec, Float); }
    export function vector(rows: number, spec?: Spec) { return createSchema(spec, Vector(rows)); }
    export function matrix(rows: number, cols: number, spec?: Spec) { return createSchema(spec, Matrix(rows, cols)); }

    function create<T>(type: Column.Type, field: Data.Field, value: (row: number) => T, toArray: Column<T>['toArray']): Column<T> {
        return {
            '@type': type,
            '@array': field['@array'],
            isDefined: field.isDefined,
            rowCount: field.rowCount,
            value,
            valueKind: field.valueKind,
            stringEquals: field.stringEquals,
            areValuesEqual: field.areValuesEqual,
            toArray
        };
    }

    function Str(field: Data.Field) { return create(Column.Type.str, field, field.str, field.toStringArray); }
    function Int(field: Data.Field) { return create(Column.Type.int, field, field.int, field.toIntArray); }
    function Float(field: Data.Field) { return create(Column.Type.float, field, field.float, field.toFloatArray); }

    function Vector(rows: number) {
        return function(field: Data.Field, category: Data.Category, key: string) {
            const value = (row: number) => Data.getVector(category, key, rows, row);
            return create(Column.Type.vector, field, value, params => createAndFillArray(field.rowCount, value, params));
        }
    }

    function Matrix(rows: number, cols: number) {
        return function(field: Data.Field, category: Data.Category, key: string) {
            const value = (row: number) => Data.getMatrix(category, key, rows, cols, row);
            return create(Column.Type.matrix, field, value, params => createAndFillArray(field.rowCount, value, params));
        }
    }

    // spec argument is to allow for specialised implementation for undefined fields
    function createSchema<T>(spec: Spec | undefined, ctor: (field: Data.Field, category: Data.Category, key: string) => Column<T>): Schema<T> {
        return { T: 0 as any, ctor, undefinedField: (spec && spec.undefinedField) || Data.DefaultUndefinedField, alias: spec && spec.alias };
    }
}

class _TypedFrame implements TypedFrame<any> { // tslint:disable-line:class-name
    header = this._frame.header;
    constructor(public _frame: Data.Frame, schema: FrameSchema) {
        for (const k of Object.keys(schema)) {
            Object.defineProperty(this, k, { value: createTypedCategory(k, schema[k], _frame), enumerable: true, writable: false, configurable: false });
        }
    }
}

class _TypedCategory implements TypedCategory<any> { // tslint:disable-line:class-name
    _rowCount = this._category.rowCount;
    constructor(public _category: Data.Category, schema: CategorySchema, public _isDefined: boolean) {
        const fieldKeys = Object.keys(schema).filter(k => k !== '@alias');
        const cache = Object.create(null);
        for (const k of fieldKeys) {
            const s = schema[k];
            Object.defineProperty(this, k, {
                get: function() {
                    if (cache[k]) return cache[k];
                    const name = s.alias || k;
                    const field = _category.getField(name) || s.undefinedField(_category.rowCount);
                    cache[k] = s.ctor(field, _category, name);
                    return cache[k];
                },
                enumerable: true,
                configurable: false
            });
        }
    }
}

function createTypedFrame(schema: FrameSchema, frame: Data.Frame): any {
    return new _TypedFrame(frame, schema);
}

function createTypedCategory(key: string, schema: CategorySchema, frame: Data.Frame) {
    const alias = (schema['@alias'] && schema['@alias'].alias) || key;
    const name = alias[0] === '_' ? alias : '_' + alias;
    const cat = frame.categories[name];
    return new _TypedCategory(cat || Data.Category.Empty, schema, !!cat);
}