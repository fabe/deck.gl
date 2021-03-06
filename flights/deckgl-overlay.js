import React, { Component } from 'react';
import { setParameters } from 'luma.gl';
import DeckGL, { LineLayer, ScatterplotLayer } from 'deck.gl';

function getColor(d) {
  const z = d.start[2];
  const r = z / 10000;

  return [255 * (1 - r * 2), 128 * r, 255 * r, 255 * (1 - r)];
}

export default class DeckGLOverlay extends Component {
  static get defaultViewport() {
    return {
      latitude: 48.57,
      longitude: 4.26,
      zoom: 4.5,
      maxZoom: 16,
      pitch: 50,
      bearing: 36,
    };
  }

  _initialize(gl) {
    // Using luma.gl for blending our paths.
    // https://github.com/uber/luma.gl/blob/master/docs/api-reference/webgl/context-state/get-parameters.md

    setParameters(gl, {
      blendFunc: [gl.SRC_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE],
      blendEquation: gl.FUNC_ADD,
    });
  }

  render() {
    const { viewport, flightPaths, airports, strokeWidth } = this.props;

    // Don't render anything if we don't have any data.
    if (!flightPaths) {
      return null;
    }

    // Configure our path layer.
    const layers = [
      new LineLayer({
        id: 'flight-paths',
        data: flightPaths,
        strokeWidth,
        fp64: false,
        getSourcePosition: d => d.start,
        getTargetPosition: d => d.end,
        getColor,
        pickable: Boolean(this.props.onHover),
        onHover: this.props.onHover,
      }),
    ];

    return (
      <DeckGL
        {...viewport}
        style={{ cursor: 'crosshair' }}
        layers={layers}
        onWebGLInitialized={this._initialize}
      />
    );
  }
}
