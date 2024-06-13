import {useCallback, useEffect, useState} from 'react'
import './App.css'
import {getServiceState, Project, State} from "./api.ts";
import {GeoJSONSource, LngLatLike, Map} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {Brash, MafInstance, View, ViewLayer} from "./view.ts";
import * as turf from '@turf/turf'
import clsx from "clsx";

function Constructor(props: { state: State, map: Map, view: View }) {
    const {state, map, view} = props;
    const preset = state.projects[1];
    const projects: Record<string, Project> = {};
    state.projects.forEach(project => projects[project.name] = project);


    const [result, setResult] = useState<MafInstance[]>([]);
    const updateMafs = useCallback((mafs: MafInstance[]) => {
        setResult(mafs);
    }, []);
    let resultTotal = 0.0;
    result.forEach(maf => resultTotal += Math.floor(maf.maf.cost));
    view.updateMafs = updateMafs;
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
            if (view.brash != null) {
                const polygon = turf.polygon(project.geo_polygon.coordinates);
                // const center = turf.centroid(polygon).geometry.coordinates as LngLatLike;
                /*map.flyTo({
                    center: center,
                    zoom: project.zoom,
                    curve: 0.9,
                    maxDuration: 4000
                });*/
                map.fitBounds(turf.bbox(polygon) as any)
            }

            setBrash(null);
            view.groupTiles.visible = false;
            view.brash = null;
            map.zoomTo(project.zoom);

        } else {
            if (view.brash == null) {
                const polygon = turf.polygon(project.geo_polygon.coordinates);
                const center = turf.centroid(polygon).geometry.coordinates as LngLatLike;
                map.flyTo({
                    center: center,
                    zoom: project.zoom + 1.0,
                    curve: 0.9,
                    maxDuration: 4000
                });

            }

            setBrash(value);
            view.groupTiles.visible = true;
            view.brash = value;
            //
            // map.zoomTo(project.zoom + 2.0);

        }
    }
    const [projectName, setProjectName] = useState(preset.name);
    const project = projects[projectName];

    const [_ages, setAges] = useState(preset.age_groups);
    // const _changeAges = (group: string, e: any) => {
    //     ages[group] = parseInt(e.target.value);
    //     view.projectAges = ages;
    //     setAges({...ages});
    //     view.requestGeneration();
    // }
    const [budget, setBudget] = useState(preset.budget);
    const [budgetMax, setBudgetMax] = useState(preset.budget * 3);
    const changeBudget = (e: any) => {
        const value = parseInt(e.target.value);
        view.projectBudget = value;
        setBudget(value);
        view.requestCalculation();
    }

    const onKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key == 'ArrowLeft' || event.key == 'ArrowDown') {
            const index = state.projects.findIndex(p => p.name == projectName);
            if (index + 1 < state.projects.length) {
                changeProject(state.projects[index + 1].name);
            }
        }
        // console.log(event.key, event.charCode, 'KEYDOW');
        if (event.key == 'ArrowRight' || event.key == 'ArrowUp') {
            const index = state.projects.findIndex(p => p.name == projectName);
            if (index > 0) {
                changeProject(state.projects[index - 1].name);
            }
        }
    }, [projectName]);
    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        document.getElementById('map-container')!.focus();
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
        view.generateProject();
    };
    const changeProject = (name: string) => {
        togglePen(null);
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
        view.projectAges = target.age_groups;
        view.projectBudget = target.budget;
        setAges(target.age_groups);
        setBudget(target.budget);
        setBudgetMax(target.budget * 3);

        setTimeout(generate);
    }
    const [catalogShown, setCatalogShown] = useState(false);
    const [projectShown, setProjectShown] = useState(false);

    return <>
        <div className="header">
            <img src="/icon.svg"/>
            <h1>Агентство дворовых дел</h1>
            <div className="spacer"/>
            <div key={resultTotal} className="budget-value">{resultTotal}</div>

            / {budget} руб.
            <select value={projectName} onChange={event => changeProject(event.target.value)}>
                {props.state.projects.map(project =>
                    <option key={project.name} value={project.name}>{project.name}</option>
                )}
            </select>
            <div className="spacer"/>
            <img height="38px" className="invert" alt="лого капремонт"
                 src="https://rpp.mos.ru/services/files/2024/03/19/7da68a6698224295aa19cc81c7c9e89a.png"/>
            <img height="38px" className="invert" alt="лого главконтроль"
                 src="https://rpp.mos.ru/services/files/2024/03/19/9e5f980741de4772b05530f5e9083491.png"/>
        </div>
        <aside className={clsx("left", projectShown && "open")}>
            <div>
                <label>
                    Бюджет
                    <input type="range" min={50000} max={budgetMax} value={budget} onChange={changeBudget}/>
                    {budget} руб.
                </label>
            </div>
            <div>
                <label>
                    Спортивная/Детская
                    <input type="range"/>
                    %
                </label>
            </div>
            <div className={clsx("table-container", projectShown && "tableShown")}>
                <table>
                    <thead>
                    <tr>
                        <th>№</th>
                        <th>Наименование</th>
                        <th>Производитель</th>
                        <th>Цена</th>
                    </tr>
                    </thead>
                    <tbody>
                    {result.map(({id, maf}) =>
                        <tr key={id} className="maf-row">
                            <td>{maf.number}</td>
                            <td>{maf.name}</td>
                            <td>{maf.provider} {maf.code}</td>
                            <td>{Math.floor(maf.cost)}</td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            <button>Скачать документы</button>
            {/*<div className="ages">*/}
            {/*    {Object.keys(ages).map(key =>*/}
            {/*        <label key={key}>*/}
            {/*            {key}*/}
            {/*            <input type="range" min={0} max={500} value={ages[key]} onChange={e => changeAges(key, e)}/>*/}
            {/*            {ages[key]}*/}
            {/*        </label>*/}
            {/*    )}*/}
            {/*</div>*/}
        </aside>
        <aside className={clsx("right", catalogShown && "open")}>
            <h2>Каталог</h2>
            <div className="catalog">
                {state.catalog.map(maf =>
                    <div key={maf.key} className="maf">
                        <img height={75} src={"preview/" + maf.preview} alt={maf.name}/>
                        <div>
                            <div>{maf.name}</div>
                            <div>{maf.provider} {maf.code} {maf.number}</div>
                            <div><b>{maf.cost}</b></div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
        <div className="footer">
            <button onClick={() => setProjectShown(!projectShown)}>Дворовая территория</button>
            <button onClick={generate}>💫Сгенерировать</button>
            <button onClick={erase}>❌Очистить</button>
            <div style={{height: '16px', border: "1px solid red"}}></div>
            <input type="range" min={0} max={3} value={brashSize}
                   onChange={event => changeBrashSize(parseInt(event.target.value))}/>
            <button className={clsx({active: brash == 'sport'})} onClick={() => togglePen('sport')}>🖊️Спорт</button>
            <button className={clsx({active: brash == 'child'})} onClick={() => togglePen('child')}>🖊️Дети</button>
            <button className={clsx({active: brash == 'relax'})} onClick={() => togglePen('relax')}>🖊️Отдых</button>
            <button className={clsx({active: brash == 'erase'})} onClick={() => togglePen('erase')}>🧹Удалить</button>
            <button onClick={() => setCatalogShown(!catalogShown)}>Каталог</button>
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
        doubleClickZoom: false,

        projection: {
            name: 'mercator'
        }
    });
    map.touchZoomRotate.disableRotation();
    map.touchZoomRotate.disable();
    map.touchPitch.enable();
    map.keyboard.disable();
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
            // map.addLayer({
            //     'id': 'geo_polygon',
            //     'type': 'fill',
            //     'source': 'geo_polygon',
            //     'layout': {},
            //     'paint': {
            //         'fill-color': '#0080ff',
            //         'fill-opacity': 0.45
            //     }
            // });
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
