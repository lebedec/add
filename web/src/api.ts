import {Polygon} from "geojson";

if (localStorage.getItem('user') == null) {
    const uid = Date.now().toString(36) + Math.random().toString(36);
    localStorage.setItem('user', uid);
}

const user = localStorage.getItem('user');

const baseUrl = 'http://localhost:44777'

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

interface Calculation {
    sport: number[][],
    child: number[][],
    relax: number[][],
}

export async function calculateProject(name: string, matrix: number[][]): Promise<Calculation> {
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