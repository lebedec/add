if (localStorage.getItem('user') == null) {
    const uid = Date.now().toString(36) + Math.random().toString(36);
    localStorage.setItem('user', uid);
}

const user = localStorage.getItem('user');

const baseUrl = 'http://localhost:44777'

export interface State {
    value: number
}

export async function getServiceState(): Promise<State> {
    const response = await fetch(`${baseUrl}/api/${user}/hello`, {method: 'GET'});
    return await response.json();
}