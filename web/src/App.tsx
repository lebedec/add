import {useCallback, useEffect, useState} from 'react'
import './App.css'
import {calculateProject, generateProject, getServiceState, Project, State} from "./api.ts";
import {GeoJSONSource, LngLatLike, Map} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {View, ViewLayer} from "./view.ts";
import * as turf from '@turf/turf'
import {Vector3} from "three";

function Constructor(props: { state: State, map: Map, view: View }) {
    const {state, map, view} = props;
    const preset = state.projects[1];
    const projects: Record<string, Project> = {};
    state.projects.forEach(project => projects[project.name] = project);

    useEffect(() => {
        changeProject(preset.name);
    }, [])
    const [projectName, setProjectName] = useState(preset.name);
    const project = projects[projectName];
    const onKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key == ']') {
            const index = state.projects.findIndex(p => p.name == projectName);
            if (index + 1 < state.projects.length) {
                changeProject(state.projects[index + 1].name);
            }
        }
        if (event.key == '[') {
            const index = state.projects.findIndex(p => p.name == projectName);
            if (index > 0) {
                changeProject(state.projects[index - 1].name);
            }
        }
    }, [projectName]);
    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [onKeyDown]);

    const onResize = useCallback(() => {
        console.log('reset');
        view.updateSize();
    }, [projectName])
    useEffect(() => {
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [onResize]);


    const changeProject = (name: string) => {
        setProjectName(name);
        const target = projects[name];
        const polygon = turf.polygon(target.geo_polygon.coordinates);
        const center = turf.centroid(polygon).geometry.coordinates as LngLatLike;
        map.flyTo({
            center: center,
            zoom: target.zoom,
            curve: 0.9,
            bearing: target.bearing,
            pitch: target.pitch,
            maxDuration: 4000
        });
        const geoPolygonSource = map.getSource('geo_polygon') as GeoJSONSource;
        geoPolygonSource.setData({
            type: 'Feature',
            geometry: target.geo_polygon,
            properties: []
        });
        view.setup(polygon.geometry);
    }
    const generate = () => {
        generateProject(project.name, view.shapeTiles).then(tiles => {
            view.erase();
            for (let tile of tiles) {
                const [[x, y], kind] = tile;
                const color = {
                    'sport': 0xFF0000,
                    'child': 0x00FF00,
                    'relax': 0x0000ff
                }[kind];
                view.createTile(new Vector3(x, y), color!);
                const marker = {
                    'sport': 1,
                    'child': 2,
                    'relax': 3
                }[kind];
                view.shapeMatrix[y][x] = marker!;
            }
            calculateProject(project.name, view.shapeMatrix).then(calculation => {
                for (const rect of calculation.sport) {
                    view.createPlaceholder(
                        new Vector3(...rect.position),
                        new Vector3(...rect.size),
                        0xff0000,
                        rect.weight * 10.0
                    );
                }
                for (const rect of calculation.child) {
                    view.createPlaceholder(
                        new Vector3(...rect.position),
                        new Vector3(...rect.size),
                        0x00ff00,
                        rect.weight * 10.0
                    );
                }
                for (const rect of calculation.relax) {
                    view.createPlaceholder(
                        new Vector3(...rect.position),
                        new Vector3(...rect.size),
                        0x0000ff,
                        rect.weight * 10.0
                    );
                }
                console.log('calc', calculation);
            })
        })
    }
    return <>
        <div className="header">
            Header {props.state.value} {project.name} {project.budget} руб.
            <select value={projectName} onChange={event => changeProject(event.target.value)}>
                {props.state.projects.map(project =>
                    <option key={project.name} value={project.name}>{project.name}</option>
                )}
            </select>
            <button onClick={generate}>Generate</button>
        </div>
    </>
}

const MOSCOW: LngLatLike = [37.617698, 55.755864];

async function createMap(): Promise<Map> {
    const map = new Map({
        container: 'map-container',

        style: 'mapbox://styles/eliagames/clx02yfe401e601qx0cp53c8g',
        center: MOSCOW,
        bearing: 0.0,
        zoom: 18.994,
        minZoom: 17.0,
        pitch: 40.00,
        attributionControl: false,
        antialias: false,
        maxPitch: 50.0,
        dragPan: false,
        doubleClickZoom: false,

        projection: {
            name: 'mercator'
        }
    });
    map.touchZoomRotate.disableRotation();
    map.touchZoomRotate.disable();
    map.touchPitch.disable();
    // map.zoom.enable();
    map.dragPan.disable();
    (map as any).transform._fov = 0.4;
    return new Promise(resolve => {
        map.on('style.load', () => {
            map.addSource('geo_polygon', {
                'type': 'geojson',
                'data': {
                    type: 'Feature',
                    geometry: {
                        "type": 'Polygon',
                        "coordinates": []
                    },
                    properties: []
                }
            });
            map.addLayer({
                'id': 'geo_polygon',
                'type': 'fill',
                'source': 'geo_polygon',
                'layout': {},
                'paint': {
                    'fill-color': '#0080ff',
                    'fill-opacity': 0.45
                }
            });
            resolve(map);
        });
    })
}

function App() {
    const [state, setState] = useState<State | null>(null);
    const [map, setMap] = useState<Map | null>(null);
    const [view, setView] = useState<View | null>(null);

    useEffect(() => {
        getServiceState().then(setState);
        createMap().then(map => {
            setMap(map);
            ViewLayer.create(map).then(view => {
                map.on('keydown', event => {
                    console.log(event.key);
                })
                let clicks: number[][] = [];
                map.on('click', event => {
                    if (event.originalEvent.altKey) {
                        console.log('zoom', map.getZoom(), 'bearing', map.getBearing(), 'pitch', map.getPitch());
                        console.log({clicks});
                        clicks = [];
                    } else {
                        clicks.push(event.lngLat.toArray());
                    }
                    view.onMouseClick();
                    // view.click(event.lngLat);
                })
                map.on('mousemove', event => {
                    // const point = turf.point(event.lngLat.toArray());
                    // if (!(turf as any).booleanContains(POLY, point)) {
                    //     return;
                    // }
                    view.onMouseMove(event.lngLat);
                });
                setView(view);
            });
        });
    }, [])

    return <div>
        {
            (state != null && map != null && view != null)
                ?
                <Constructor state={state} map={map} view={view}/>
                :
                <div className="loading">{
                    map == null ? 'Загружаем карту ...' : 'Загружаем каталог МАФ ...'
                }</div>
        }
        <div id="map-container"/>
    </div>
}

export default App
