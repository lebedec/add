import {useEffect, useState} from 'react'
import './App.css'
import {getServiceState, State} from "./api.ts";

function App() {
    const [state, setState] = useState<State | null>(null)

    useEffect(() => {
        console.log('render');
        getServiceState().then(state => setState(state))
    }, [])

    return state ? <div>Hello {state.value}</div> : <div>Loading</div>
}

export default App
