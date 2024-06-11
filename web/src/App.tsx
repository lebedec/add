import {useCallback, useEffect, useState} from 'react'
import './App.css'
import {generateProject, getServiceState, Project, State} from "./api.ts";
import {GeoJSONSource, LngLatLike, Map} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {Brash, View, ViewLayer} from "./view.ts";
import * as turf from '@turf/turf'
import clsx from "clsx";

function Constructor(props: { state: State, map: Map, view: View }) {
    const {state, map, view} = props;
    const preset = state.projects[1];
    const projects: Record<string, Project> = {};
    state.projects.forEach(project => projects[project.name] = project);

    useEffect(() => {
        changeProject(preset.name);
    }, [])
    const [brashSize, setBrashSize] = useState(view.cursorRadius);
    const changeBrashSize = (value: number) => {
        setBrashSize(value);
        view.cursorRadius = value;
    }
    const [brash, setBrash] = useState<Brash>(null);
    const togglePen = (value: Brash) => {
        if (value == brash || value == null) {
            setBrash(null);
            view.groupTiles.visible = false;
            view.brash = null;
        } else {
            setBrash(value);
            view.groupTiles.visible = true;
            view.brash = value;
        }
    }
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
        view.updateSize();
    }, [projectName])
    useEffect(() => {
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [onResize]);

    const erase = () => {
        view.erase();
        view.eraseShapeMatrix();
    }

    const generate = () => {
        console.log('generate', view.project);
        generateProject(view.project, view.shapeTiles).then(tiles => {
            view.eraseShapeMatrix();
            for (let tile of tiles) {
                const [[x, y], kind] = tile;
                const marker = {
                    'sport': 1,
                    'child': 2,
                    'relax': 3
                }[kind];
                view.shapeMatrix[y][x] = marker!;
            }
            view.calculateProject();
        })
    };
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
        view.project = name;
        console.log('change', view.project);
        setTimeout(generate);
    }

    return <>
        <div className="header">
            Header {props.state.value} {project.name} {project.budget} руб.
            <select value={projectName} onChange={event => changeProject(event.target.value)}>
                {props.state.projects.map(project =>
                    <option key={project.name} value={project.name}>{project.name}</option>
                )}
            </select>

        </div>
        <div className="footer">
            <button onClick={generate}>💫Сгенерировать</button>
            <button onClick={erase}>❌Удалить</button>
            <div style={{height: '16px', border: "1px solid red"}}></div>
            <input type="range" min={0} max={3} value={brashSize} onChange={event => changeBrashSize(parseInt(event.target.value))} />
            <button className={clsx({active: brash == 'sport'})} onClick={() => togglePen('sport')}>🖊️Спорт</button>
            <button className={clsx({active: brash == 'child'})} onClick={() => togglePen('child')}>🖊️Дети</button>
            <button className={clsx({active: brash == 'relax'})} onClick={() => togglePen('relax')}>🖊️Отдых</button>
            <button className={clsx({active: brash == 'erase'})} onClick={() => togglePen('erase')}>🧹Удалить</button>

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
        antialias: true,
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
                map.on('mousemove', event => {
                    view.onMouseMove(event.lngLat);
                    if (view.cursorActive) {
                        view.onMousePaint();
                    }
                });
                map.on('mousedown', event => {
                    view.onMouseMove(event.lngLat);
                    view.cursorActive = true;
                    view.onMousePaint();
                });
                map.on('mouseup', () => {
                    view.cursorActive = false;
                })
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
