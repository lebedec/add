import {useCallback, useEffect, useState} from 'react'
import './App.css'
import {AgeGroups, getServiceState, Project, State} from "./api.ts";
import {GeoJSONSource, LngLatLike, Map} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {Brash, MafInstance, View, ViewLayer} from "./view.ts";
import * as turf from '@turf/turf'
import clsx from "clsx";

import FileSaver from "file-saver";
import X2JS from "x2js";

const fNumber = Intl.NumberFormat('ru-RU');
const fMoney = Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB'});

function Constructor(props: { state: State, map: Map, view: View }) {
    const {state, map, view} = props;
    const preset = state.projects[1];
    const projects: Record<string, Project> = {};
    state.projects.forEach(project => projects[project.name] = project);


    const [providers, setProviders] = useState([...view.projectProviders]);
    const toggleProvider = (value: string) => {
        let index = providers.indexOf(value);
        if (index != -1) {

            providers.splice(index, 1);
            setProviders([...providers])
            view.projectProviders = [...providers];
        } else {

            setProviders([value, ...providers])
            view.projectProviders = [value, ...providers];
        }
        view.requestCalculation();
    }

    const hasProvider = (value: string) => {

        return providers.indexOf(value) != -1;
    }
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
                // const polygon = turf.polygon(project.geo_polygon.coordinates);
                // const center = turf.centroid(polygon).geometry.coordinates as LngLatLike;
                /*map.flyTo({
                    center: center,
                    zoom: project.zoom,
                    curve: 0.9,
                    maxDuration: 4000
                });*/
                // map.fitBounds(turf.bbox(polygon) as any)
            }

            setBrash(null);
            view.groupTiles.visible = false;
            view.brash = null;
            map.dragPan.enable();
            // map.zoomTo(project.zoom);

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

                setProjectShown(false);
                setCatalogShown(false);
            }

            setBrash(value);
            view.groupTiles.visible = true;
            view.brash = value;
            map.dragPan.disable();
            //
            // map.zoomTo(project.zoom + 2.0);

        }
    }
    const [projectName, setProjectName] = useState(preset.name);
    const project = projects[projectName];

    const [ages, setAges] = useState<AgeGroups>(preset.age_groups);
    const changeAges = (group: string, value: boolean) => {
        (ages as any)[group] = value;
        view.projectAges = ages;
        setAges({...ages});
        view.requestGeneration();
    }
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
    const exportProject = () => {
        // saveAs('<hello>bubba</hello>', `${project.name}.xml`);
        const serializer = new X2JS();
        const xml = serializer.js2xml({
            'mafs': result
        });
        var blob = new Blob([xml], {
            type: "application/xml"
        });
        FileSaver.saveAs(blob, `${project.name}.xml`);
    }
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

        let providers = ['ЛЕБЕР', 'KENGURUPRO'];

        view.setup(polygon.geometry);
        view.project = name;
        view.projectAges = target.age_groups;
        view.projectBudget = target.budget;
        view.projectProviders = providers;
        setProviders(providers);
        setAges(target.age_groups);
        setBudget(target.budget);
        setBudgetMax(target.budget * 3);

        setTimeout(generate);
    }
    const [catalogShown, setCatalogShown] = useState(false);
    const [projectShown, setProjectShown] = useState(false);

    return <>
        <div className="header">
            {/*<img src="/icon.svg"/>*/}
            <img src="/logo-a.svg"/>
            <h1>Агентство дворовых дел</h1>

            <div className="spacer"/>


            <div className="projectSelect">

                <select value={projectName} onChange={event => changeProject(event.target.value)}>
                    {props.state.projects.map(project =>
                        <option key={project.name} value={project.name}>{project.name}</option>
                    )}
                </select>
                <svg width="16" height="9" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M5.00042 3.78102L8.30028 0.481201L9.24308 1.42401L5.00042 5.66668L0.757812 1.42401L1.70062 0.481201L5.00042 3.78102Z"
                        fill="black"/>
                </svg>
            </div>


            <div className="spacer"/>
            <img height="38px" className="invert" alt="лого капремонт"
                 src="https://rpp.mos.ru/services/files/2024/03/19/7da68a6698224295aa19cc81c7c9e89a.png"/>
            <img height="38px" className="invert" alt="лого главконтроль"
                 src="https://rpp.mos.ru/services/files/2024/03/19/9e5f980741de4772b05530f5e9083491.png"/>
        </div>
        <aside className={clsx("left", projectShown && "open")}>

            <div className="projBar">
                {projectShown ?
                    <button className="buttonClose" onClick={() => setProjectShown(false)}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                             xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M10.6667 10.6667V5.33333L1.33333 5.33333V10.6667H10.6667ZM1.33333 1.33333V4H10.6667V1.33333H1.33333ZM12 11.3333C12 11.7015 11.7015 12 11.3333 12H0.666666C0.298467 12 0 11.7015 0 11.3333V0.666666C0 0.298467 0.298467 0 0.666666 0H11.3333C11.7015 0 12 0.298467 12 0.666666V11.3333ZM6 6.66667L8.33333 9.33333H3.66667L6 6.66667Z"
                                fill="currentColor"/>
                        </svg>
                        Наполнение площадки
                    </button>
                    :
                    <button className="buttonClose" onClick={() => setProjectShown(true)}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                             xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M1.33333 1.33333L1.33333 6.66667L10.6667 6.66667V1.33333L1.33333 1.33333ZM10.6667 10.6667V8H1.33333L1.33333 10.6667H10.6667ZM0 0.666667C0 0.29848 0.29848 0 0.666667 0L11.3333 0C11.7015 0 12 0.29848 12 0.666667V11.3333C12 11.7015 11.7015 12 11.3333 12H0.666667C0.29848 12 0 11.7015 0 11.3333L0 0.666667ZM6 5.33333L3.66667 2.66667H8.33333L6 5.33333Z"
                                fill="currentColor"/>
                        </svg>
                        Наполнение площадки
                    </button>
                }

                <div className="spacer"/>

                {
                    projectShown && <div style={{color: '#8A8D91', marginRight: '4px'}}>Бюджет</div>
                }

                <div key={resultTotal} className="budget-value">{fNumber.format(resultTotal)} </div>

                <div style={{fontWeight: '600', color: '#5267C8'}}>&nbsp;/&nbsp;{fNumber.format(budget)} ₽</div>
                <label>
                    <input type="range" min={50000} max={budgetMax} value={budget} onChange={changeBudget}/>
                </label>

            </div>

            <div className={clsx("table-container", projectShown && "tableShown")}>
                <table>
                    <thead>
                    <tr>
                        <th>№</th>
                        <th>Наименование</th>
                        <th>Производитель</th>
                        <th>Цена, ₽</th>
                    </tr>
                    </thead>
                    <tbody>
                    {result.map(({id, maf}) =>
                        <tr key={id} className="maf-row">
                            <td>{maf.number}</td>
                            <td>{maf.name}</td>
                            <td>{maf.provider} {maf.code}</td>
                            <td style={{textAlign: 'right'}}>{fNumber.format(Math.floor(maf.cost))}</td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            <button className="buttonExport" onClick={exportProject}>
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M8.66667 0.333252L12 3.66659V13.0054C12 13.3706 11.7034 13.6666 11.3377 13.6666H0.662267C0.296507 13.6666 0 13.3631 0 13.0054V0.994452C0 0.629285 0.296633 0.333252 0.662267 0.333252H8.66667ZM6.66667 6.99992V4.33325H5.33333V6.99992H3.33333L6 9.66658L8.66667 6.99992H6.66667Z"
                        fill="currentColor"/>
                </svg>

                Скачать XML файлы интеграции
            </button>
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
            <div className="providersBar">
                <div className="providers">

                    {catalogShown ?

                        <button className="buttonClose" onClick={() => setCatalogShown(false)}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                 xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M10.6667 10.6667V5.33333L1.33333 5.33333V10.6667H10.6667ZM1.33333 1.33333V4H10.6667V1.33333H1.33333ZM12 11.3333C12 11.7015 11.7015 12 11.3333 12H0.666666C0.298467 12 0 11.7015 0 11.3333V0.666666C0 0.298467 0.298467 0 0.666666 0H11.3333C11.7015 0 12 0.298467 12 0.666666V11.3333ZM6 6.66667L8.33333 9.33333H3.66667L6 6.66667Z"
                                    fill="currentColor"/>
                            </svg>
                            Каталог
                        </button>
                        :
                        <button className="buttonClose" onClick={() => setCatalogShown(true)}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                 xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M1.33333 1.33333L1.33333 6.66667L10.6667 6.66667V1.33333L1.33333 1.33333ZM10.6667 10.6667V8H1.33333L1.33333 10.6667H10.6667ZM0 0.666667C0 0.29848 0.29848 0 0.666667 0L11.3333 0C11.7015 0 12 0.29848 12 0.666667V11.3333C12 11.7015 11.7015 12 11.3333 12H0.666667C0.29848 12 0 11.7015 0 11.3333L0 0.666667ZM6 5.33333L3.66667 2.66667H8.33333L6 5.33333Z"
                                    fill="currentColor"/>
                            </svg>
                            Каталог
                        </button>
                    }

                    {state.providers.map(name =>
                        <span
                            key={name}
                            className={clsx("providerLabel", hasProvider(name) && "active")}
                            onClick={() => toggleProvider(name)}
                        >
                            {name}
                        </span>
                    )}

                </div>

            </div>
            <div className="catalog">
                {state.catalog.filter(maf => providers.includes(maf.provider)).map(maf =>
                    <div key={maf.key} className="maf">
                        <img className="preview" src={"preview/" + maf.preview} alt={maf.name}/>
                        <div className="card">
                            <div className="title">{maf.name}</div>
                            <div className="codes">{maf.provider} {maf.code} {maf.number}</div>
                            <div className="spacer"/>
                            <div className="cost">{fMoney.format(maf.cost)}</div>
                        </div>
                    </div>
                )}
            </div>

        </aside>
        <div className="footer">
            <div className="panel">

                <div style={{margin: "0px 12px"}}>

                    <img src="/icons/i-brash.svg"/>
                </div>
                <input type="range" min={0} max={3} value={brashSize}
                       onChange={event => changeBrashSize(parseInt(event.target.value))}/>

                <button className={clsx("buttonBrash", brash == 'sport' && "buttonSportActive")}
                        onClick={() => togglePen('sport')}>
                    <svg width="15" height="14" viewBox="0 0 15 14" fill="currentColor"
                         xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M7.50065 0.333374C11.1825 0.333374 14.1673 3.31814 14.1673 7.00004C14.1673 10.6819 11.1825 13.6667 7.50065 13.6667C3.81875 13.6667 0.833984 10.6819 0.833984 7.00004C0.833984 3.31814 3.81875 0.333374 7.50065 0.333374ZM7.74465 7.91071L5.43204 11.9174C6.06814 12.1853 6.76712 12.3334 7.50065 12.3334C7.80878 12.3334 8.11078 12.3072 8.40458 12.2571C8.23292 11.0422 8.39472 9.77344 8.92758 8.59451L7.74465 7.91071ZM10.0897 9.26497C9.73525 10.1045 9.61205 10.9962 9.69858 11.8604C10.5122 11.4923 11.2165 10.9259 11.7503 10.2231L10.0897 9.26497ZM5.40635 6.56151C4.65165 7.61271 3.63352 8.38731 2.49642 8.84664C2.85098 9.80904 3.47539 10.6403 4.2776 11.2497L6.58998 7.24404L5.40635 6.56151ZM12.8084 6.47411L12.6365 6.55524C11.9138 6.91251 11.2659 7.43657 10.7563 8.11024L12.4177 9.06931C12.6858 8.43304 12.834 7.73384 12.834 7.00004C12.834 6.82257 12.8253 6.64711 12.8084 6.47411ZM2.16732 7.00004C2.16732 7.17751 2.17598 7.35297 2.19292 7.52597C2.98482 7.16897 3.6951 6.61664 4.24462 5.89037L2.58333 4.93143C2.31541 5.56753 2.16732 6.26651 2.16732 7.00004ZM10.7237 2.75039L8.41132 6.75604L9.59445 7.43924C10.3494 6.38751 11.3679 5.61256 12.5055 5.15317C12.1762 4.26049 11.6141 3.47952 10.8929 2.88439L10.7237 2.75039ZM7.50065 1.66671C7.19232 1.66671 6.89005 1.69287 6.59605 1.74311C6.76838 2.95836 6.60652 4.22724 6.07342 5.40625L7.25665 6.08937L9.56925 2.08272C8.93318 1.8148 8.23418 1.66671 7.50065 1.66671ZM5.30274 2.13974L5.17524 2.19901C4.41576 2.56755 3.75689 3.111 3.251 3.77699L4.91137 4.7357C5.26597 3.89606 5.38928 3.00409 5.30274 2.13974Z"
                            fill="currentColor"/>
                    </svg>
                    Спорт
                </button>
                <button className={clsx("buttonBrash", brash == 'child' && "buttonChildActive")}
                        onClick={() => togglePen('child')}>
                    <svg width="15" height="14" viewBox="0 0 15 14" fill="currentColor"
                         xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M7.50065 10.3334C8.97338 10.3334 10.1673 9.13944 10.1673 7.66671H8.83398C8.83398 8.40311 8.23705 9.00004 7.50065 9.00004C6.76425 9.00004 6.16732 8.40311 6.16732 7.66671H4.83398C4.83398 9.13944 6.02789 10.3334 7.50065 10.3334ZM3.83398 0.333374C2.17713 0.333374 0.833984 1.67652 0.833984 3.33337C0.833984 4.23823 1.23479 5.04892 1.86688 5.59838C1.62988 6.24377 1.50065 6.94071 1.50065 7.66671C1.50065 10.9804 4.18694 13.6667 7.50065 13.6667C10.8144 13.6667 13.5007 10.9804 13.5007 7.66671C13.5007 6.94071 13.3715 6.24377 13.1345 5.59838C13.7665 5.04892 14.1673 4.23823 14.1673 3.33337C14.1673 1.67652 12.8242 0.333374 11.1673 0.333374C10.0831 0.333374 9.13432 0.908307 8.60738 1.76869C8.24832 1.70168 7.87832 1.66671 7.50065 1.66671C7.12298 1.66671 6.75298 1.70168 6.39392 1.76869C5.86698 0.908307 4.91822 0.333374 3.83398 0.333374ZM2.16732 3.33337C2.16732 2.4129 2.91351 1.66671 3.83398 1.66671C4.5542 1.66671 5.16934 2.12389 5.40178 2.76601L5.61372 3.35149L6.21232 3.17998C6.62072 3.06294 7.05278 3.00004 7.50065 3.00004C7.94852 3.00004 8.38058 3.06294 8.78898 3.17998L9.38758 3.35149L9.59952 2.76601C9.83198 2.12389 10.4471 1.66671 11.1673 1.66671C12.0878 1.66671 12.834 2.4129 12.834 3.33337C12.834 3.95538 12.4936 4.49873 11.9857 4.78577L11.4434 5.09225L11.7124 5.65409C12.0038 6.26264 12.1673 6.94464 12.1673 7.66671C12.1673 10.244 10.078 12.3334 7.50065 12.3334C4.92332 12.3334 2.83398 10.244 2.83398 7.66671C2.83398 6.94464 2.99751 6.26264 3.28892 5.65409L3.55795 5.09225L3.01564 4.78577C2.50774 4.49874 2.16732 3.95538 2.16732 3.33337Z"
                            fill="currentColor"/>
                    </svg>
                    Дети
                </button>
                <button className={clsx("buttonBrash", brash == 'relax' && "buttonRelaxActive")}
                        onClick={() => togglePen('relax')}>
                    <svg width="13" height="15" viewBox="0 0 13 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M2.5 4.66663C2.5 2.45749 4.29086 0.666626 6.5 0.666626C8.70913 0.666626 10.5 2.45749 10.5 4.66663C10.5 4.84139 10.4887 5.01376 10.4669 5.18301C11.68 5.86938 12.5 7.17163 12.5 8.66663C12.5 10.8758 10.7091 12.6666 8.5 12.6666H7.16667V14.6666H5.83333V12.6666H4.16667C2.14162 12.6666 0.5 11.025 0.5 8.99996C0.5 7.52416 1.37141 6.25307 2.62732 5.67132C2.54423 5.3503 2.5 5.01355 2.5 4.66663ZM3.17309 6.88789C2.38117 7.26116 1.83333 8.06716 1.83333 8.99996C1.83333 10.2886 2.878 11.3333 4.16667 11.3333H8.5C9.97273 11.3333 11.1667 10.1394 11.1667 8.66663C11.1667 7.53703 10.4641 6.56988 9.4696 6.18152L8.9086 5.96244C9.02713 5.53554 9.16667 5.11451 9.16667 4.66663C9.16667 3.19387 7.97273 1.99996 6.5 1.99996C5.02724 1.99996 3.83333 3.19387 3.83333 4.66663C3.83333 5.53851 4.25107 6.31265 4.90013 6.80029L4.09923 7.86629C3.73845 7.59523 3.42477 7.26416 3.17309 6.88789Z"
                            fill="currentColor"/>
                    </svg>
                    Отдых
                </button>
                <button className={clsx("buttonBrash", brash == 'erase' && "buttonEraseActive")}
                        onClick={() => togglePen('erase')}>
                    <svg width="14" height="13" viewBox="0 0 14 13" fill="currentColor"
                         xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M5.22376 4.90299L1.92393 8.2028L5.38681 11.6657L6.16657 11.6652V11.6644H6.9476L9.4664 9.1456L5.22376 4.90299ZM6.16657 3.96018L10.4092 8.2028L12.2948 6.3172L8.0522 2.07457L6.16657 3.96018ZM8.83327 11.6644H13.4999V12.9977H7.49993L4.83486 12.9994L0.509713 8.6742C0.249366 8.41387 0.249366 7.9918 0.509713 7.7314L7.5808 0.660353C7.84113 0.4 8.26327 0.4 8.5236 0.660353L13.7091 5.8458C13.9694 6.10613 13.9694 6.52827 13.7091 6.7886L8.83327 11.6644Z"
                            fill="currentColor"/>
                    </svg>
                    Стереть
                </button>

                <button className="buttonBrash" onClick={erase}>
                    <svg width="15" height="14" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M10.834 3.00004H14.1673V4.33337H12.834V13C12.834 13.3682 12.5355 13.6667 12.1673 13.6667H2.83398C2.4658 13.6667 2.16732 13.3682 2.16732 13V4.33337H0.833984V3.00004H4.16732V1.00004C4.16732 0.631854 4.4658 0.333374 4.83398 0.333374H10.1673C10.5355 0.333374 10.834 0.631854 10.834 1.00004V3.00004ZM11.5007 4.33337H3.50065V12.3334H11.5007V4.33337ZM5.50065 6.33337H6.83398V10.3334H5.50065V6.33337ZM8.16732 6.33337H9.50065V10.3334H8.16732V6.33337ZM5.50065 1.66671V3.00004H9.50065V1.66671H5.50065Z"
                            fill="#06080A"/>
                    </svg>

                </button>
            </div>

            <div className="panel">


                <div className="sliders">

                    <label className="switch">
                        <input type="checkbox" checked={ages.sport}
                               onChange={e => changeAges('sport', e.target.checked)}/>
                        <span className="slider"></span>
                    </label>
                    <div>Спорт</div>

                    <label className="switch">
                        <input type="checkbox" checked={ages.child}
                               onChange={e => changeAges('child', e.target.checked)}/>
                        <span className="slider"></span>
                    </label>
                    <div>Дети</div>

                    <label className="switch">
                        <input type="checkbox" checked={ages.relax}
                               onChange={e => changeAges('relax', e.target.checked)}/>
                        <span className="slider"></span>
                    </label>
                    <div>Отдых</div>

                    <button className="buttonGen" onClick={generate}>
                        <svg width="13" height="14" viewBox="0 0 13 14" fill="currentColor"
                             xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M8.64855 9.3386L7.17341 12.4387C7.07848 12.6382 6.83981 12.7229 6.64035 12.628C6.59588 12.6069 6.55568 12.5777 6.52181 12.5419L4.16087 10.0494C4.09767 9.98267 4.01343 9.93973 3.92231 9.92787L0.518121 9.48287C0.299068 9.45427 0.144708 9.25347 0.173341 9.0344C0.179721 8.9856 0.195074 8.93833 0.218614 8.89507L1.85955 5.87947C1.90348 5.79873 1.91827 5.70533 1.90144 5.61502L1.27268 2.23994C1.23222 2.02276 1.37548 1.81391 1.59266 1.77345C1.64108 1.76443 1.69075 1.76443 1.73917 1.77345L5.11426 2.40221C5.20461 2.41903 5.29801 2.40425 5.37868 2.36032L8.39428 0.719381C8.58835 0.613787 8.83128 0.685501 8.93681 0.879541C8.96041 0.922807 8.97575 0.970047 8.98208 1.01889L9.42708 4.42308C9.43901 4.5142 9.48195 4.59844 9.54861 4.66163L12.0411 7.02253C12.2015 7.17447 12.2084 7.42767 12.0565 7.58807C12.0226 7.6238 11.9824 7.653 11.9379 7.67413L8.83788 9.14933C8.75488 9.1888 8.68801 9.25567 8.64855 9.3386ZM9.17974 10.6233L10.1225 9.68053L12.951 12.5089L12.0082 13.4517L9.17974 10.6233Z"
                                fill="currentColor"/>
                        </svg>
                        Сгенерировать
                    </button>
                </div>
            </div>


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
