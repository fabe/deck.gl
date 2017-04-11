/* global window */
import {Layer, assembleShaders} from 'deck.gl';
import {GL, Model, Geometry} from 'luma.gl';

import {textMatrixToTexture} from './utils';

import fragmentShader from './fragment.glsl';
import gridVertex from './grid-vertex.glsl';
import labelVertex from './label-vertex.glsl';
import labelFragment from './label-fragment.glsl';

/* Constants */
const FONT_SIZE = 48;

const defaultProps = {
  data: [],
  fontSize: 12 * window.devicePixelRatio,
  ticksCount: 6,
  xScale: null,
  yScale: null,
  zScale: null,
  formatTick: x => x.toFixed(2),
  padding: 0,
  color: [0, 0, 0, 255]
};

/* Utils */
function flatten(arrayOfArrays) {
  const flatArray = arrayOfArrays.reduce((acc, arr) => acc.concat(arr), []);
  if (Array.isArray(flatArray[0])) {
    return flatten(flatArray);
  }
  return flatArray;
}

function getTicks({scale, axis, ticksCount, formatTick}) {
  return scale.ticks(ticksCount).map(t => ({
    value: t,
    position: scale(t),
    text: formatTick(t, axis)
  }));
}

/*
 * @classdesc
 * A layer that plots a surface based on a z=f(x,y) equation.
 *
 * @class
 * @param {Object} [props]
 * @param {Integer} [props.ticksCount] - number of ticks along each axis, see
      https://github.com/d3/d3-axis/blob/master/README.md#axis_ticks
 * @param {Number} [props.padding] - amount to set back grids from the plot,
      relative to the size of the bounding box
 * @param {d3.scale} [props.xScale] - a d3 scale for the x axis
 * @param {d3.scale} [props.yScale] - a d3 scale for the y axis
 * @param {d3.scale} [props.zScale] - a d3 scale for the z axis
 * @param {Function} [props.formatTick] - returns a string from (value, axis)
 * @param {Number} [props.fontSize] - size of the labels
 * @param {Array} [props.color] - color of the gridlines, in [r,g,b,a]
 */
export default class AxesLayer extends Layer {

  initializeState() {
    const {gl} = this.context;
    const {attributeManager} = this.state;

    attributeManager.addInstanced({
      instancePositions: {size: 2, update: this.calculateInstancePositions, noAlloc: true},
      instanceNormals: {size: 3, update: this.calculateInstanceNormals, noAlloc: true}
    });

    this.setState({
      models: this._getModels(gl),
      numInstances: 0,
      labels: null
    });
  }

  updateState({oldProps, props, changeFlags}) {
    const {attributeManager} = this.state;

    if ((oldProps.ticksCount !== props.ticksCount) ||
      (oldProps.xScale !== props.xScale) ||
      (oldProps.yScale !== props.yScale) ||
      (oldProps.zScale !== props.zScale)) {
      const {xScale, yScale, zScale} = props;

      const ticks = [
        getTicks({...props, axis: 'x', scale: xScale}),
        getTicks({...props, axis: 'z', scale: zScale}),
        getTicks({...props, axis: 'y', scale: yScale})
      ];

      const xRange = xScale.range();
      const yRange = yScale.range();
      const zRange = zScale.range();

      this.setState({
        ticks,
        labelTexture: this.renderLabelTexture(ticks),
        gridDims: [
          xRange[1] - xRange[0],
          zRange[1] - zRange[0],
          yRange[1] - yRange[0]
        ],
        gridCenter: [
          (xRange[0] + xRange[1]) / 2,
          (zRange[0] + zRange[1]) / 2,
          (yRange[0] + yRange[1]) / 2
        ]
      });

      attributeManager.invalidateAll();
    }
  }

  updateAttributes(props) {
    super.updateAttributes(props);
    const {attributeManager, models, numInstances} = this.state;
    const changedAttributes = attributeManager.getChangedAttributes({clearChangedFlags: true});

    models.grids.setInstanceCount(numInstances);
    models.grids.setAttributes(changedAttributes);

    models.labels.setInstanceCount(numInstances);
    models.labels.setAttributes(changedAttributes);
  }

  draw({uniforms}) {
    const {gridDims, gridCenter, models, labelTexture} = this.state;
    const {fontSize, color, padding} = this.props;

    if (labelTexture) {
      const baseUniforms = {
        fontSize,
        gridDims,
        gridCenter,
        gridOffset: padding,
        strokeColor: color
      };

      models.grids.render(Object.assign({}, uniforms, baseUniforms));

      models.labels.render(Object.assign({}, uniforms, baseUniforms, labelTexture));
    }
  }

  _getModels(gl) {
    /* grids:
     * for each x tick, draw rectangle on yz plane around the bounding box.
     * for each y tick, draw rectangle on zx plane around the bounding box.
     * for each z tick, draw rectangle on xy plane around the bounding box.
     * show/hide is toggled by the vertex shader
     */
    const gridShaders = assembleShaders(gl, {
      vs: gridVertex,
      fs: fragmentShader
    });

    /*
     * rectangles are defined in 2d and rotated in the vertex shader
     *
     * (-1,1)      (1,1)
     *   +-----------+
     *   |           |
     *   |           |
     *   |           |
     *   |           |
     *   +-----------+
     * (-1,-1)     (1,-1)
     */

    // offset of each corner
    const gridPositions = [
      // left edge
      -1, -1, 0, -1, 1, 0,
      // top edge
      -1, 1, 0, 1, 1, 0,
      // right edge
      1, 1, 0, 1, -1, 0,
      // bottom edge
      1, -1, 0, -1, -1, 0
    ];
    // normal of each edge
    const gridNormals = [
      // left edge
      -1, 0, 0, -1, 0, 0,
      // top edge
      0, 1, 0, 0, 1, 0,
      // right edge
      1, 0, 0, 1, 0, 0,
      // bottom edge
      0, -1, 0, 0, -1, 0
    ];

    const grids = new Model({
      gl,
      id: `${this.props.id}-grids`,
      vs: gridShaders.vs,
      fs: gridShaders.fs,
      geometry: new Geometry({
        drawMode: GL.LINES,
        positions: new Float32Array(gridPositions),
        normals: new Float32Array(gridNormals)
      }),
      isInstanced: true
    });

    /* labels
     * one label is placed at each end of every grid line
     * show/hide is toggled by the vertex shader
     */
    const labelShaders = assembleShaders(gl, {
      vs: labelVertex,
      fs: labelFragment
    });

    let labelTexCoords = [];
    let labelPositions = [];
    let labelNormals = [];
    let labelIndices = [];
    for (let i = 0; i < 8; i++) {
      /*
       * each label is rendered as a rectangle
       *   0     2
       *    +--.+
       *    | / |
       *    +'--+
       *   1     3
       */
      labelTexCoords = labelTexCoords.concat([0, 0, 0, 1, 1, 0, 1, 1]);
      labelIndices = labelIndices.concat([
        i * 4 + 0, i * 4 + 1, i * 4 + 2,
        i * 4 + 2, i * 4 + 1, i * 4 + 3
      ]);

      // all four vertices of this label's rectangle is anchored at the same grid endpoint
      for (let j = 0; j < 4; j++) {
        labelPositions = labelPositions.concat(gridPositions.slice(i * 3, i * 3 + 3));
        labelNormals = labelNormals.concat(gridNormals.slice(i * 3, i * 3 + 3));
      }
    }

    const labels = new Model({
      gl,
      id: `${this.props.id}-labels`,
      vs: labelShaders.vs,
      fs: labelShaders.fs,
      geometry: new Geometry({
        drawMode: GL.TRIANGLES,
        indices: new Uint16Array(labelIndices),
        positions: new Float32Array(labelPositions),
        texCoords: {size: 2, value: new Float32Array(labelTexCoords)},
        normals: new Float32Array(labelNormals)
      }),
      isInstanced: true
    });

    return {grids, labels};
  }

  calculateInstancePositions(attribute) {
    const {ticks} = this.state;

    const positions = ticks.map(axisTicks =>
      axisTicks.map((t, i) => [t.position, i])
    );

    const value = new Float32Array(flatten(positions));
    attribute.value = value;

    this.setState({numInstances: value.length / attribute.size});
  }

  calculateInstanceNormals(attribute) {
    const {ticks: [xTicks, zTicks, yTicks]} = this.state;

    const normals = [
      xTicks.map(t => [1, 0, 0]),
      zTicks.map(t => [0, 1, 0]),
      yTicks.map(t => [0, 0, 1])
    ];

    attribute.value = new Float32Array(flatten(normals));
  }

  renderLabelTexture(ticks) {

    if (this.state.labels) {
      this.state.labels.labelTexture.delete();
    }

    // attach a 2d texture of all the label texts
    const textureInfo = textMatrixToTexture(this.context.gl, ticks, FONT_SIZE);
    if (textureInfo) {
      // success
      const {columnWidths, texture} = textureInfo;

      return {
        labelHeight: FONT_SIZE,
        labelWidths: columnWidths,
        labelTextureDim: [texture.width, texture.height],
        labelTexture: texture
      };
    }
    return null;
  }

}

AxesLayer.layerName = 'AxesLayer';
AxesLayer.defaultProps = defaultProps;
