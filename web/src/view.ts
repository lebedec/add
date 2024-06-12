import mapboxgl, {CustomLayerInterface, LngLatLike, Map} from "mapbox-gl";
import {GLTF, GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    AmbientLight,
    BoxGeometry,
    Camera,
    DirectionalLight,
    DoubleSide,
    EdgesGeometry,
    ExtrudeGeometry,
    Group,
    HemisphereLight,
    LineBasicMaterial,
    LineSegments,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshPhongMaterial,
    Scene,
    Shape,
    Vector2,
    Vector3,
    WebGLRenderer
} from "three";
import {Polygon, Position} from "geojson";
import {calculateProject, generateProject, Slot} from "./api.ts";
import * as turf from '@turf/turf'

type ViewLoader = (scene: View) => void;

export type Brash = 'sport' | 'child' | 'relax' | 'erase' | null;

export class View {
    camera: Camera;
    scene: Scene;
    renderer: WebGLRenderer;
    loader: GLTFLoader;

    light: DirectionalLight;

    center: LngLatLike;
    centerMatrix: Matrix4;
    centerMatrixInverse: Matrix4;

    models: Record<string, GLTF> = {};

    xAxis = new Vector3(1.0, 0.0, 0.0);
    yAxis = new Vector3(0.0, -1.0, 0.0);
    rotation = 0.0;
    shape = new Shape();
    shapeTiles: number[][] = [];
    shapeMatrix: number[][] = [];
    shapeBounds = new Vector2();

    tile = new Vector3(0, 0);
    cursor = new Vector3(0.0, 0.0, 0.0);
    cursorMesh: Mesh;
    cursorRadius = 1;
    cursorActive = false;
    brash: Brash = null;
    project: string = '';
    projectBudget = 0;
    projectAges = {};

    groupMafs = new Group();
    groupTiles = new Group();
    groupGizmos = new Group();

    requestCalculation: () => void;
    requestGeneration: () => void;

    constructor(map: Map, context: WebGLRenderingContext) {
        this.camera = new Camera();
        this.scene = new Scene();

        // use the Mapbox GL JS map canvas for three.js
        this.renderer = new WebGLRenderer({
            canvas: map.getCanvas(),
            context: context,
            antialias: true,
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.autoClear = false;

        this.loader = new GLTFLoader();
        this.center = map.getCenter();
        this.centerMatrix = createCenterMatrix(this.center);
        this.centerMatrixInverse = this.centerMatrix.clone().invert();

        const skyColor = 0xB1E1FF;  // light blue
        const groundColor = 0x000000;
        const intensity2 = 1.0;
        const light2 = new HemisphereLight(skyColor, groundColor, intensity2);
        this.scene.add(light2);

        this.light = new DirectionalLight(0xFFFFFF, 1.0);
        this.light.position.set(0, -50, 100);
        this.light.target.position.set(0, 0, 0);
        this.light.castShadow = true;
        this.light.shadow.camera.left = -32;
        this.light.shadow.camera.right = 32;
        this.light.shadow.camera.bottom = -32;
        this.light.shadow.camera.top = 32;
        this.light.shadow.camera.far = 500;
        this.scene.add(this.light);

        const ambientLight = new AmbientLight(0xFFFFFF, 2.0);
        this.scene.add(ambientLight);

        this.groupTiles.visible = false;
        this.scene.add(this.groupMafs);
        this.scene.add(this.groupTiles);
        this.scene.add(this.groupGizmos);

        this.cursorMesh = this.createCursor();
        this.requestCalculation = debounce(this.calculateProject.bind(this));
        this.requestGeneration = debounce(this.generateProject.bind(this));
    }

    async awake() {
        // child
        this.models['leber-lgik-120.glb'] = await this.loadModel('./models/leber-lgik-120.glb');
        this.models['leber-lgik-803.glb'] = await this.loadModel('./models/leber-lgik-803.glb');
        this.models['leber-msk-108101.glb'] = await this.loadModel('./models/leber-msk-108101.glb');
        this.models['leber-lgp-97.glb'] = await this.loadModel('./models/leber-lgp-97.glb');
        this.models['leber-lgk-31.glb'] = await this.loadModel('./models/leber-lgk-31.glb');
        this.models['leber-msk-201.glb'] = await this.loadModel('./models/leber-msk-201.glb');
        this.models['leber-lgp-109p.glb'] = await this.loadModel('./models/leber-lgp-109p.glb');
        this.models['leber-lgk-109.glb'] = await this.loadModel('./models/leber-lgk-109.glb');
        this.models['leber-lgk-20.glb'] = await this.loadModel('./models/leber-lgk-20.glb');
        this.models['leber-lgk-247.glb'] = await this.loadModel('./models/leber-lgk-247.glb');
        this.models['leber-lgk-21.glb'] = await this.loadModel('./models/leber-lgk-21.glb');
        // sport
        this.models['kpro-018.glb'] = await this.loadModel('./models/kpro-018.glb');
        this.models['kpro-001.glb'] = await this.loadModel('./models/kpro-001.glb');
        this.models['kpro-010.glb'] = await this.loadModel('./models/kpro-010.glb');
        this.models['kpro-014.glb'] = await this.loadModel('./models/kpro-014.glb');
        this.models['kpro-022.glb'] = await this.loadModel('./models/kpro-022.glb');
        this.models['kpro-035.glb'] = await this.loadModel('./models/kpro-035.glb');
        // relax
        this.models['leber-lgud-18.glb'] = await this.loadModel('./models/leber-lgud-18.glb');
        this.models['leber-lgdp-14.glb'] = await this.loadModel('./models/leber-lgdp-14.glb');
    }

    async loadModel(path: string): Promise<GLTF> {
        const model: GLTF = await this.loader.loadAsync(path);
        model.scene.traverse(node => {

            if ((node as any).isMesh && !node.name.startsWith('_')) {
                node.castShadow = true;
            }
        });
        return model;
    }

    updateSize() {
        // use the Mapbox GL JS map canvas for three.js
        this.renderer = new WebGLRenderer({
            canvas: this.renderer.getContext().canvas,
            context: this.renderer.getContext(),
            antialias: true,
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.autoClear = false;
        this.camera = new Camera();
    }

    setup(polygon: Polygon) {
        this.center = polygon.coordinates[0][0] as LngLatLike;
        this.centerMatrix = createCenterMatrix(this.center);
        this.centerMatrixInverse = this.centerMatrix.clone().invert();

        // recalculate axis
        const p0 = this.fromMap(polygon.coordinates[0][0]);
        const p1 = this.fromMap(polygon.coordinates[0][1]);
        this.xAxis = p1.sub(p0);
        this.yAxis = new Vector3(-this.xAxis.y, this.xAxis.x, 0.0);
        this.rotation = new Vector3(1.0, 0.0, 0.0).angleTo(this.xAxis);

        this.groupMafs.remove(...this.groupMafs.children);
        this.groupTiles.remove(...this.groupTiles.children);

        this.cursorMesh = this.createCursor();

        this.shape = new Shape(polygon.coordinates[0].map(p => this.fromMap2D(p)));
        this.shapeTiles = this.shape.getPoints().map(point => this.toTile(new Vector3(point.x, point.y)).toArray());
        this.shapeBounds = new Vector2();
        for (let [x, y] of this.shapeTiles) {
            if (x > this.shapeBounds.x) {
                this.shapeBounds.x = x;
            }
            if (y > this.shapeBounds.y) {
                this.shapeBounds.y = y;
            }
        }
        this.shapeMatrix = [];
        for (let y = 0; y < this.shapeBounds.y; y++) {
            this.shapeMatrix.push(new Array(this.shapeBounds.x).fill(0));
        }

        const geometry = new ExtrudeGeometry(this.shape, {bevelEnabled: false, depth: 0.1});
        const mesh = new Mesh(geometry, new MeshPhongMaterial({
            flatShading: true,
            color: 0xffffff,
            opacity: 1.0,
            transparent: false
        }));
        mesh.receiveShadow = true;
        mesh.position.z = -0.1;
        this.groupGizmos.add(mesh);
    }

    erase() {
        this.groupMafs.remove(...this.groupMafs.children);
        this.groupTiles.remove(...this.groupTiles.children);
    }

    eraseShapeMatrix() {
        this.shapeMatrix = [];
        for (let y = 0; y < this.shapeBounds.y; y++) {
            this.shapeMatrix.push(new Array(this.shapeBounds.x).fill(0));
        }
    }

    createTile(key: string, tile: Vector3, color: number): Mesh {
        const material = new MeshPhongMaterial({
            color,
            flatShading: true,
            side: DoubleSide,
        });
        const geometry = new BoxGeometry(0.5, 0.5, 0.5);
        const mesh = new Mesh(geometry, material);
        mesh.position.copy(this.toPosition(tile));
        mesh.position.z = 0.2;
        mesh.rotation.z = this.rotation;
        mesh.userData.key = key;
        this.groupTiles.add(mesh);
        return mesh;
    }

    createPlaceholder(key: string, tile: Vector3, size: Vector3, color: number, height: number): Mesh {
        const material = new MeshPhongMaterial({
            color,
            flatShading: true,
            side: DoubleSide,
        });
        height = 0.1;
        const geometry = new BoxGeometry(size.x - 0.3, size.y - 0.3, height);
        const mesh = new Mesh(geometry, material);
        tile.x += size.x / 2.0 - 0.5;
        tile.y += size.y / 2.0 - 0.5;
        mesh.position.copy(this.toPosition(tile));
        mesh.position.z = height / 2.0;
        mesh.rotation.z = this.rotation;
        mesh.userData.key = key;
        this.groupTiles.add(mesh);
        return mesh;
    }

    createMaf(key: string, tile: Vector3, size: Vector3, model: string, rotation: number) {
        const mesh = this.models[model].scene.clone(true);
        mesh.rotation.set(0, 0, this.rotation + rotation);
        tile.x += size.x / 2.0 - 0.5;
        tile.y += size.y / 2.0 - 0.5;
        mesh.position.copy(this.toPosition(tile));
        mesh.userData.key = key;
        this.groupMafs.add(mesh);
    }

    createCursor(): Mesh {
        const material2 = new MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.5
        });
        const geometry2 = new BoxGeometry(1.0, 1.0, 1.0);
        this.cursorMesh = new Mesh(geometry2, material2);
        // this.cursorMesh.position.z = 0.5;
        this.groupGizmos.remove(...this.groupGizmos.children);
        this.groupGizmos.add(this.cursorMesh);

        let geo = new EdgesGeometry(this.cursorMesh.geometry); // or WireframeGeometry
        let mat = new LineBasicMaterial({color: 0x000000});
        let wireframe = new LineSegments(geo, mat);
        this.cursorMesh.add(wireframe);
        this.cursorMesh.rotation.z = this.rotation;

        return this.cursorMesh;
    }

    onMouseMove(coords: LngLatLike) {
        const mouse = this.fromMap(coords);

        const centerX = this.fromMap(this.center).projectOnVector(this.xAxis);
        const centerY = this.fromMap(this.center).projectOnVector(this.yAxis);

        let projX = mouse.clone().projectOnVector(this.xAxis);
        let projY = mouse.clone().projectOnVector(this.yAxis);

        const tileX = Math.floor(projX.length());
        const tileY = Math.floor(projY.length());
        this.tile = new Vector3(tileX * Math.sign(projX.x - centerX.x), tileY * -Math.sign(projY.y - centerY.y));
        // projX = projX.setLength(tileX);
        // projY = projY.setLength(tileY);
        // this.cursor = projX.add(projY);

        this.cursor = this.toPosition(this.tile);

        this.cursorMesh.position.x = this.cursor.x;
        this.cursorMesh.position.y = this.cursor.y;
    }

    generateProject() {
        console.log('generate', this.project);
        generateProject(this.project, this.shapeTiles, this.projectAges).then(tiles => {
            this.eraseShapeMatrix();
            for (let tile of tiles) {
                const [[x, y], kind] = tile;
                const marker = {
                    'sport': 1,
                    'child': 2,
                    'relax': 3
                }[kind];
                this.shapeMatrix[y][x] = marker!;
            }
            this.calculateProject();
        })
    }

    calculateProject() {

        // console.log('calculate', this.project, this.shapeMatrix);

        // this.erase();

        calculateProject(this.project, this.shapeMatrix, this.projectBudget).then(calculation => {

            let removingMafs: Record<string, any> = {};
            for (let maf of this.groupMafs.children) {
                removingMafs[maf.userData.key] = maf;
            }
            let removingRects: Record<string, any> = {};
            for (let mesh of this.groupTiles.children) {
                removingRects[mesh.userData.key] = mesh;
            }

            for (const rect of calculation) {
                if (rect.maf != null && rect.maf.model != "") {
                    const mkey = mafKey(rect);
                    if (removingMafs[mkey]) {
                        delete removingMafs[mkey]
                    } else {
                        this.createMaf(
                            mkey,
                            new Vector3(...rect.position),
                            new Vector3(...rect.size),
                            rect.maf.model,
                            rect.maf_rotation
                        )
                    }
                } else if (rect.maf != null) {
                    console.log('MAF not implemented', rect.maf?.key)
                }
                const rkey = rectKey(rect);
                if (removingRects[rkey]) {
                    delete removingRects[rkey];
                } else {
                    const color = {
                        'sport': 0xFF0000,
                        'child': 0x00FF00,
                        'relax': 0x0000ff
                    }[rect.maf_kind];
                    this.createPlaceholder(
                        rkey,
                        new Vector3(...rect.position),
                        new Vector3(...rect.size),
                        color!,
                        rect.weight * 10.0
                    );
                }
            }

            this.groupTiles.remove(...Object.values(removingRects));
            this.groupMafs.remove(...Object.values(removingMafs));

            // console.log('calc', calculation);
        });
    }

    onMousePaint() {
        // console.log('paint', this.brash, 'tile', this.tile.toArray(), 'cursor', this.cursor.toArray());
        if (this.brash == null) {
            return;
        }

        const brashMapping = {
            'erase': 0,
            'sport': 1,
            'child': 2,
            'relax': 3
        };

        for (let oy = -this.cursorRadius; oy <= this.cursorRadius; oy++) {
            for (let ox = -this.cursorRadius; ox <= this.cursorRadius; ox++) {
                let [x, y] = this.tile.toArray();
                x += ox;
                y += oy;
                if (y < this.shapeMatrix.length && y >= 0) {
                    if (x < this.shapeMatrix[y].length && x >= 0) {

                        const point = turf.point([x, y]);
                        if (!(turf as any).booleanContains(turf.polygon([this.shapeTiles]), point)) {
                            continue;
                        }

                        const marker = brashMapping[this.brash];
                        if (this.shapeMatrix[y][x] == marker) {
                            continue;
                        }



                        this.shapeMatrix[y][x] = marker;

                        let current: Record<string, any> = {};
                        for (let mesh of this.groupTiles.children) {
                            current[mesh.userData.key] = mesh;
                        }

                        const key = tileKey(this.brash, x, y);

                        if (current[key]) {

                        } else {
                            const colors = [
                                0x000000,
                                0xFF0000,
                                0x00FF00,
                                0x0000ff
                            ];
                            this.createTile(key, new Vector3(x, y), colors[marker]);
                        }
                        this.requestCalculation();
                    }
                }
            }

        }
    }

    toTile(position: Vector3): Vector2 {
        const centerX = this.fromMap(this.center).projectOnVector(this.xAxis);
        const centerY = this.fromMap(this.center).projectOnVector(this.yAxis);
        let projX = position.clone().projectOnVector(this.xAxis);
        let projY = position.clone().projectOnVector(this.yAxis);
        const tileX = Math.floor(projX.length());
        const tileY = Math.floor(projY.length());
        return new Vector2(tileX * Math.sign(projX.x - centerX.x), tileY * -Math.sign(projY.y - centerY.y));
    }

    toPosition(tile: Vector3): Vector3 {
        const projX = this.xAxis.clone().setLength(tile.x + 0.5);
        const projY = this.yAxis.clone().setLength(-tile.y - 0.5);
        return projX.add(projY);
    }

    fromMap(coords: LngLatLike | Position): Vector3 {
        const mercator = mapboxgl.MercatorCoordinate.fromLngLat(coords as LngLatLike, 0);
        return new Vector3(mercator.x, mercator.y).applyMatrix4(this.centerMatrixInverse);
    }

    fromMap2D(coords: LngLatLike | Position): Vector2 {
        const point = this.fromMap(coords);
        return new Vector2(point.x, point.y);
    }

    render() {
        this.cursorMesh.scale.x = 1.0 + this.cursorRadius * 2;
        this.cursorMesh.scale.y = 1.0 + this.cursorRadius * 2;
        this.light.shadow.camera.updateProjectionMatrix();
    }
}

export class ViewLayer implements CustomLayerInterface {
    id: string;
    type: "custom";
    renderingMode?: "2d" | "3d" | undefined;
    resolve: ViewLoader;
    view: View | null;
    map: Map;

    constructor(map: Map, resolve: ViewLoader) {
        this.id = 'renderer';
        this.type = 'custom';
        this.resolve = resolve;
        this.view = null;
        this.map = map;
    }

    static create(map: Map): Promise<View> {
        return new Promise(resolve => {
            const layer = new ViewLayer(map, resolve);
            map.addLayer(layer);
        })
    }

    onAdd(map: Map, gl: WebGLRenderingContext): void {
        const view = new View(map, gl);
        view.awake().then(() => {
            this.view = view;
            this.resolve(view);
        });
    }

    render(_gl: WebGLRenderingContext, matrix: number[]): void {
        if (!this.view) {
            return
        }
        this.view.camera.projectionMatrix = new Matrix4().fromArray(matrix).multiply(this.view.centerMatrix);
        this.view.render();
        this.view.renderer.resetState();
        this.view.renderer.render(this.view.scene, this.view.camera);
        this.map.triggerRepaint();
    }

}

function createCenterMatrix(center: LngLatLike): Matrix4 {

    const modelAltitude = 0;
    // const modelRotate = [Math.PI / 2, 0, 0];
    const modelRotate = [0, 0, 0];

    const mercator = mapboxgl.MercatorCoordinate.fromLngLat(center, modelAltitude);
    const model = {
        translateX: mercator.x,
        translateY: mercator.y,
        translateZ: mercator.z,
        rotateX: modelRotate[0],
        rotateY: modelRotate[1],
        rotateZ: modelRotate[2],
        scale: mercator.meterInMercatorCoordinateUnits()
    };

    const rotationX = new Matrix4().makeRotationAxis(
        new Vector3(1, 0, 0),
        model.rotateX
    );
    const rotationY = new Matrix4().makeRotationAxis(
        new Vector3(0, 1, 0),
        model.rotateY
    );
    const rotationZ = new Matrix4().makeRotationAxis(
        new Vector3(0, 0, 1),
        model.rotateZ
    );

    return new Matrix4()
        .makeTranslation(
            model.translateX,
            model.translateY,
            model.translateZ as number
        )
        .scale(new Vector3(model.scale, -model.scale, model.scale))
        .multiply(rotationX)
        .multiply(rotationY)
        .multiply(rotationZ);
}

export function debounce<F extends Function>(func: F, timeout = 250): F {
    let timer = -1;
    let call = (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func(args);
        }, timeout);
    };
    return call as any;
}


function rectKey(rect: Slot): string {
    return `${rect.maf_kind}:${rect.position[0]},${rect.position[1]}:${rect.size[0]}x${rect.size[1]}`;
}

function mafKey(rect: Slot): string {
    return `${rect.maf?.key}:${rect.position[0]},${rect.position[1]}:${rect.size[0]}x${rect.size[1]}`;
}

function tileKey(brash: string, x: number, y: number): string {
    return `${brash}:${x},${y}`;
}