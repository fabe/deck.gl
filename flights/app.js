/* global window,document */
import React, { Component } from 'react';
import { render } from 'react-dom';
import MapGL from 'react-map-gl';
import DeckGLOverlay from './deckgl-overlay.js';

import { json as requestJson } from 'd3-request';

// Mapbox Token
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZnNjaHVsdHoiLCJhIjoieUlyWkhQZyJ9.b0UF4_X5Zm7bMsKRtPihYA'; // eslint-disable-line

// Source data JSON
const DATA_URL = {
  FLIGHT_PATHS: '/dist/data.json', // eslint-disable-line
};

const cardStyles = {
  backgroundColor: 'white',
  padding: '2em',
  position: 'absolute',
  width: 200,
  zIndex: 1000,
};

class Root extends Component {
  constructor(props) {
    super(props);
    this.state = {
      viewport: {
        ...DeckGLOverlay.defaultViewport,
        width: 500,
        height: 500,
      },
      flightPaths: null,
      text: 'Hover over path',
    };

    requestJson(DATA_URL.FLIGHT_PATHS, (error, response) => {
      if (!error) {
        this.setState({ flightPaths: response });
      }
    });
  }

  // ↓ DON'T MIND THESE METHODS
  componentDidMount() {
    // Making the site responsive.
    window.addEventListener('resize', this._resize.bind(this));
    this._resize();
  }

  _resize() {
    this._onViewportChange({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  _onViewportChange(viewport) {
    this.setState({
      viewport: { ...this.state.viewport, ...viewport },
    });
  }
  // ↑ DON'T MIND THESE METHODS

  _onHover(d) {
    // React to hovering over the flight paths.
    if (d.object) {
      this.setState({
        text: `Flight ${d.object.name} from ${d.object.country}.`,
      });
    }
  }

  render() {
    const { viewport, flightPaths, airports } = this.state;

    return (
      <MapGL
        {...viewport}
        mapStyle="mapbox://styles/fschultz/cjb8iqifp4hzq2sp6i3cloevc"
        onViewportChange={this._onViewportChange.bind(this)}
        mapboxApiAccessToken={MAPBOX_TOKEN}
      >

        <div style={cardStyles}>
          {this.state.text}
        </div>

        <DeckGLOverlay
          viewport={viewport}
          strokeWidth={3}
          flightPaths={flightPaths}
          onHover={this._onHover.bind(this)}
        />
      </MapGL>
    );
  }
}

render(<Root />, document.body.appendChild(document.createElement('div')));
