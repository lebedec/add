import mapboxgl, {CustomLayerInterface, LngLatLike} from "mapbox-gl";
import {Map} from 'mapbox-gl';
import {GLTF, GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    AmbientLight, BoxGeometry,
    Camera, DirectionalLight, DoubleSide, EdgesGeometry, ExtrudeGeometry, Group,
    HemisphereLight, LineBasicMaterial, LineSegments,
    Matrix4, Mesh, MeshBasicMaterial, MeshPhongMaterial,
    Scene, Shape, Vector2,
    Vector3,
    WebGLRenderer
} from "three";
import {Polygon, Position} from "geojson";

type ViewLoader = (scene: View) => void;

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

    groupMafs = new Group();
    groupTiles = new Group();
    groupGizmos = new Group();

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

        this.scene.add(this.groupMafs);
        this.scene.add(this.groupTiles);
        this.scene.add(this.groupGizmos);

        this.cursorMesh = this.createCursor();
    }

    async awake() {
        this.models['a'] = await this.loadModel('./models/leber-lgik-120.glb');
        this.models['b'] = await this.loadModel('./models/leber-lgik-803.glb');
    }

    async loadModel(path: string): Promise<GLTF> {
        const model: GLTF = await this.loader.loadAsync(path);
        model.scene.traverse(node => {
            // if outline add to group
            if ((node as any).isMesh) {
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

        const model2 = this.models['b'].scene.clone(true);
        model2.rotation.set(0, 0, this.rotation);
        model2.position.x = 5.0;
        model2.position.y = 4.0;
        model2.position.copy(this.toPosition(new Vector3(5, 4)));
        this.groupMafs.add(model2);

        const model3 = this.models['b'].scene.clone(true);
        model3.rotation.set(0, 0, this.rotation);
        model3.position.x = 0.0;
        model3.position.y = 0.0;
        this.groupMafs.add(model3);

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
            opacity: 0.5,
            transparent: true
        }));
        mesh.receiveShadow = true;
        mesh.position.z = -0.05;
        this.groupMafs.add(mesh);


        // const b1 = this.createBox(0xFF0000);
        // this.groupMafs.add(b1);
        // b1.rotation.z = this.rotation;
        // const b2 = this.createBox(0x00FF00);
        // b2.position.x = 2.0;
        // b2.rotation.z = this.rotation;
        // this.groupMafs.add(b2)
        // const b3 = this.createBox(0x0000FF);
        // b3.position.x = 1.0;
        // b3.position.y = 2.0;
        // b3.position.z = 0.0;
        // b3.rotation.z = this.rotation;
        // this.groupMafs.add(b3)
    }

    erase() {
        this.groupMafs.remove(...this.groupMafs.children);
        this.groupTiles.remove(...this.groupTiles.children);
        this.shapeMatrix = [];
        for (let y = 0; y < this.shapeBounds.y; y++) {
            this.shapeMatrix.push(new Array(this.shapeBounds.x).fill(0));
        }
    }

    createTile(tile: Vector3, color: number): Mesh {
        const material = new MeshPhongMaterial({
            color,
            flatShading: true,
            side: DoubleSide,
        });
        const geometry = new BoxGeometry(0.9, 0.9, 0.2);
        const mesh = new Mesh(geometry, material);
        mesh.position.copy(this.toPosition(tile));
        mesh.position.z = 0.0;
        mesh.rotation.z = this.rotation;
        this.groupMafs.add(mesh);
        return mesh;
    }

    createPlaceholder(position: Vector3, size: Vector3, color: number): Mesh {
        const material = new MeshPhongMaterial({
            color,
            flatShading: true,
            side: DoubleSide,
        });
        const h = 0.9;
        const geometry = new BoxGeometry(size.x - 0.3, size.y - 0.3, h);
        const mesh = new Mesh(geometry, material);
        position.x += size.x / 2.0 - 0.5;
        position.y += size.y / 2.0 - 0.5;
        position.z = h / 2.0;
        mesh.position.copy(this.toPosition(position));
        mesh.rotation.z = this.rotation;
        this.groupMafs.add(mesh);
        return mesh;
    }

    createCursor(): Mesh {
        const material2 = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5
        });
        const geometry2 = new BoxGeometry(1.0, 1.0, 1.0);
        this.cursorMesh = new Mesh(geometry2, material2);
        // this.cursorMesh.position.z = 0.5;
        this.groupGizmos.remove(...this.groupGizmos.children);
        this.groupGizmos.add(this.cursorMesh);

        let geo = new EdgesGeometry(this.cursorMesh.geometry); // or WireframeGeometry
        let mat = new LineBasicMaterial({color: 0xffffff});
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

    onMouseClick() {
        console.log('click', 'tile', this.tile.toArray(), 'cursor', this.cursor.toArray());
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