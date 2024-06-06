import mapboxgl, {CustomLayerInterface, LngLatLike} from "mapbox-gl";
import {Map} from 'mapbox-gl';
import {GLTF, GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    AmbientLight, BoxGeometry,
    Camera, DirectionalLight, DoubleSide, ExtrudeGeometry, Group,
    HemisphereLight,
    Matrix4, Mesh, MeshNormalMaterial, MeshPhongMaterial,
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

    groupMafs = new Group();
    groupTiles = new Group();

    xAxis = new Vector3(1.0, 0.0, 0.0);
    yAxis = new Vector3(0.0, -1.0, 0.0);
    rotation = 0.0;

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

    convert(coords: LngLatLike | Position): Vector3 {
        const mercator = mapboxgl.MercatorCoordinate.fromLngLat(coords as LngLatLike, 0);
        return new Vector3(mercator.x, mercator.y).applyMatrix4(this.centerMatrixInverse);
    }

    convert2d(coords: LngLatLike | Position): Vector2 {
        const point = this.convert(coords);
        return new Vector2(point.x, point.y);
    }

    tileToWorld(tile: Vector3): Vector3 {
        const projX = this.xAxis.clone().setLength(tile.x);
        const projY = this.yAxis.clone().setLength(tile.y);
        return projX.add(projY);
    }


    getRotation(p0: Position, p1: Position) {
        const p0v = this.convert(p0);
        const p1v = this.convert(p1);
        const xAxis = p1v.sub(p0v);
        const yAxis = new Vector3(-xAxis.y, xAxis.x, 0.0);
        return new Vector3(1.0, 0.0, 0.0).angleTo(xAxis);
    }

    recalculateRotation(p0: Vector3, p1: Vector3) {
        // const p0 = this.convert(bounds[0]);
        // const p1 = this.convert(bounds[1]);
        this.xAxis = p1.sub(p0);
        this.yAxis = new Vector3(-this.xAxis.y, this.xAxis.x, 0.0);
        this.rotation = new Vector3(1.0, 0.0, 0.0).angleTo(this.xAxis);
    }

    recreateAt(center: LngLatLike, polygon: Polygon) {
        this.center = polygon.coordinates[0][0];
        this.centerMatrix = createCenterMatrix(this.center);
        this.centerMatrixInverse = this.centerMatrix.clone().invert();

        this.recalculateRotation(
            this.convert(polygon.coordinates[0][0]),
            this.convert(polygon.coordinates[0][1])
        );
        // this.rotation = 0.0;

        this.groupMafs.remove(...this.groupMafs.children);

        const model2 = this.models['b'].scene.clone(true);
        model2.rotation.set(0, 0, this.rotation);
        console.log('rot', model2.rotation.toArray());
        model2.position.x = 5.0;
        model2.position.y = 4.0;
        this.groupMafs.add(model2);

        const model3 = this.models['b'].scene.clone(true);
        model3.rotation.set(0, 0, this.rotation);
        model3.position.x = 0.0;
        model3.position.y = 0.0;
        console.log('rot', model3.rotation.toArray());
        this.groupMafs.add(model3);

        const shape = new Shape(polygon.coordinates[0].map(p => this.convert2d(p)));
        const geometry = new ExtrudeGeometry(shape, {bevelEnabled: false, depth: 0.1});
        const mesh = new Mesh(geometry, new MeshPhongMaterial({
            flatShading: true,
            color: 0xffffff,
            opacity: 0.5,
            transparent: true
        }) );
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

    createTile(tile: Vector3, color: number): Mesh {
        const material = new MeshPhongMaterial({
            color,
            flatShading: true,
            side: DoubleSide,
        });
        const geometry = new BoxGeometry(1.0, 1.0, 1.0);
        const mesh = new Mesh(geometry, material);
        mesh.position.copy(this.tileToWorld(tile));
        mesh.rotation.z = this.rotation;
        this.groupMafs.add(mesh);
        return mesh;
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