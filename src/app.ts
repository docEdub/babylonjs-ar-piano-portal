import {
    Color3,
    Engine,
    IWebXRPlane,
    Material,
    Matrix,
    Mesh,
    PolygonMeshBuilder,
    Quaternion,
    Scene,
    StandardMaterial,
    Vector2,
    Vector3,
    WebXRPlaneDetector
} from "@babylonjs/core";

import "@babylonjs/loaders";
import earcut from "earcut";

(async () => {
    //#region Setup engine and scene

    const canvas = <HTMLCanvasElement>document.getElementById("MainCanvas");
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);

    window.addEventListener('resize', function() {
        engine.resize()
    })

    engine.runRenderLoop(() => {
        if (scene.activeCamera) {
            scene.render()
        }
    })

    //#endregion

    //#region Setup WebXR AR

    // Setup AR.
    const xr = await scene.createDefaultXRExperienceAsync({
        inputOptions: {
            doNotLoadControllerMeshes: true
        },
        uiOptions: {
            sessionMode: "immersive-ar",
            referenceSpaceType: "local-floor"
        },
        optionalFeatures: true
    });

    //#endregion

    //#region Room setup plane processing
    // See https://playground.babylonjs.com/#98TM63.

    const xrFeaturesManager = xr.baseExperience.featuresManager;
    const xrPlanesFeature = <WebXRPlaneDetector>xrFeaturesManager.enableFeature(WebXRPlaneDetector.Name, "latest");

    class PlaneContext {
        public xrPlane: IWebXRPlane = null;
        public mesh: Mesh = null;
    }

    const planeMap = new Map<IWebXRPlane, PlaneContext>();

    xrPlanesFeature.onPlaneAddedObservable.add(plane => {
        const planeContext = new PlaneContext;
        planeContext.xrPlane = plane;

        plane.polygonDefinition.push(plane.polygonDefinition[0]);
        const polygon_triangulation = new PolygonMeshBuilder("Plane.mesh", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
        const mesh = polygon_triangulation.build(false, 0.01);
        planeContext.mesh = mesh;

        planeMap.set(plane, planeContext);

        const material = new StandardMaterial("Plane.material", scene);
        material.alpha = 0.5;
        material.emissiveColor = Color3.Random();
        mesh.createNormals(false);
        mesh.material = material;

        mesh.rotationQuaternion = new Quaternion();
        plane.transformationMatrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
    });

    xrPlanesFeature.onPlaneUpdatedObservable.add(plane => {
        let material: Material = null;
        let planeContext: PlaneContext = null;

        if (planeMap.has(plane)) {
            planeContext = planeMap.get(plane);

            // Keep the material, dispose the old polygon.
            material = planeContext.mesh.material;
            planeContext.mesh.dispose(false, false);
        }

        if (plane.polygonDefinition.some(p => !p)) {
            return;
        }

        if (!planeContext) {
            planeContext = new PlaneContext;
            planeContext.xrPlane = plane;
        }

        plane.polygonDefinition.push(plane.polygonDefinition[0]);
        const polygon_triangulation = new PolygonMeshBuilder("name", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
        const mesh = polygon_triangulation.build(false, 0.01);
        planeContext.mesh = mesh;

        mesh.createNormals(false);
        mesh.material = material;
        mesh.rotationQuaternion = new Quaternion();
        plane.transformationMatrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
    })

    xrPlanesFeature.onPlaneRemovedObservable.add(plane => {
        if (plane && planeMap.has(plane)) {
            planeMap.get(plane).mesh.dispose();
        }
    })

    xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
        planeMap.forEach(planeContext => {
            planeContext.mesh.dispose();
        });
        planeMap.clear();
    });

    //#endregion
})();
