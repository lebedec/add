import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = 'pk.eyJ1IjoiZWxpYWdhbWVzIiwiYSI6ImNrOXplM3NybjBkcGMzZG52bnY1aXNkaTAifQ.k51q0OdlSKlor6Up948WuA';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App/>
)
