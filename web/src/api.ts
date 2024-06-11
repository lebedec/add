import {Polygon} from "geojson";

if (localStorage.getItem('user') == null) {
    const uid = Date.now().toString(36) + Math.random().toString(36);
    localStorage.setItem('user', uid);
}

const user = localStorage.getItem('user');

const baseUrl = 'http://localhost:44777'

export interface Maf {
    name: string,
    key: string,
    provider: string,
    number: string,
    code: string,
    category: string,
    cost: number
    preview: string,
    model: string,
    size: number[],
    safe: number[],
    tiles: number[]
}

export interface Project {
    name: string,
    budget: number,
    geo_polygon: Polygon,
    bearing: number,
    pitch: number,
    zoom: number
}

export interface State {
    value: number,
    projects: Project[]
}

export async function getServiceState(): Promise<State> {
    const response = await fetch(`${baseUrl}/api/${user}/hello`, {method: 'GET'});
    return await response.json();
}

type Tile = [[number, number], string];

export async function generateProject(name: string, area: number[][]): Promise<Tile[]> {
    const response = await fetch(`${baseUrl}/api/${user}/generation`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, area })
    })
    return await response.json()
}

export interface Slot {
    id: number,
    position: number[],
    size: number[],
    weight: number,
    distance: number,
    budget: number,
    maf_kind: string,
    maf: null | Maf,
    maf_budget: number,
    maf_rotation: number
}

export async function calculateProject(name: string, matrix: number[][]): Promise<Slot[]> {
    const response = await fetch(`${baseUrl}/api/${user}/calculation`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, matrix })
    })
    return await response.json()
}