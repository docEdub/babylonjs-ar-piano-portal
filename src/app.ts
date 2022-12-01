import {
    AbstractMesh,
    Color3,
    Engine,
    IWebXRPlane,
    Material,
    Matrix,
    Mesh,
    MeshBuilder,
    PointerEventTypes,
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
    const xrPlaneDetectorFeature = <WebXRPlaneDetector>xrFeaturesManager.enableFeature(WebXRPlaneDetector.Name, "latest");

    class PlaneContext {
        public xrPlaneInterface: IWebXRPlane = null;
        public mesh: Mesh = null;
    }

    const xrPlaneMap = new Map<IWebXRPlane, PlaneContext>();
    const planeMeshMap = new Map<AbstractMesh, PlaneContext>();

    xrPlaneDetectorFeature.onPlaneAddedObservable.add(plane => {
        console.debug(plane);

        const planeContext = new PlaneContext;
        planeContext.xrPlaneInterface = plane;

        plane.polygonDefinition.push(plane.polygonDefinition[0]);
        const polygon_triangulation = new PolygonMeshBuilder("Wall", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
        const mesh = polygon_triangulation.build(false, 0.01);
        planeContext.mesh = mesh;

        xrPlaneMap.set(plane, planeContext);
        planeMeshMap.set(mesh, planeContext);

        const material = new StandardMaterial("Wall.material", scene);
        material.alpha = 0.5;
        material.emissiveColor = Color3.Random();
        mesh.createNormals(false);
        mesh.material = material;

        mesh.rotationQuaternion = new Quaternion();
        plane.transformationMatrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
    });

    xrPlaneDetectorFeature.onPlaneUpdatedObservable.add(plane => {
        let material: Material = null;
        let planeContext: PlaneContext = null;

        if (xrPlaneMap.has(plane)) {
            planeContext = xrPlaneMap.get(plane);

            // Keep the material, dispose the old polygon.
            material = planeContext.mesh.material;
            planeMeshMap.delete(planeContext.mesh);
            planeContext.mesh.dispose(false, false);
        }

        if (plane.polygonDefinition.some(p => !p)) {
            return;
        }

        if (!planeContext) {
            planeContext = new PlaneContext;
            planeContext.xrPlaneInterface = plane;
        }

        plane.polygonDefinition.push(plane.polygonDefinition[0]);
        const polygon_triangulation = new PolygonMeshBuilder("Wall", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
        const mesh = polygon_triangulation.build(false, 0.01);
        planeContext.mesh = mesh;

        planeMeshMap.set(mesh, planeContext);

        mesh.createNormals(false);
        mesh.material = material;
        mesh.rotationQuaternion = new Quaternion();
        plane.transformationMatrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
    })

    xrPlaneDetectorFeature.onPlaneRemovedObservable.add(plane => {
        if (plane && xrPlaneMap.has(plane)) {
            xrPlaneMap.get(plane).mesh.dispose();
        }
    })

    xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
        xrPlaneMap.forEach(planeContext => {
            planeContext.mesh.dispose();
        });
        xrPlaneMap.clear();
        planeMeshMap.clear();
    });

    //#endregion

    //#region Pointer processing

    const framePlaneMesh = MeshBuilder.CreatePlane("Frame", { size: 10 });
    const framePlaneMaterial = new StandardMaterial("Frame.material");
    framePlaneMaterial.alpha = 0.5;
    framePlaneMaterial.emissiveColor.set(1, 0, 0);
    framePlaneMesh.material = framePlaneMaterial;
    framePlaneMesh.rotation.x = -Math.PI / 2;
    framePlaneMesh.scaling.setAll(0.1);
    framePlaneMesh.bakeCurrentTransformIntoVertices();

    scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                const pickedMesh = pointerInfo.pickInfo.pickedMesh;
                if (!planeMeshMap.has(pickedMesh)) {
                    console.debug(`Picked plane mesh not found in planeMeshMap.`);
                    return;
                }
                const planeContext = planeMeshMap.get(pickedMesh);
                if ("vertical" !== planeContext.xrPlaneInterface.xrPlane.orientation.toLowerCase()) {
                    console.debug(`Plane orientation is not vertical. Orientation = ${planeContext.xrPlaneInterface.xrPlane.orientation.toLowerCase()}.`);
                    return;
                }

                // TODO: Add logic to keep frame from overlapping with floor, ceiling or another wall.

                framePlaneMesh.position.copyFrom(pointerInfo.pickInfo.pickedPoint);
                if (pickedMesh.rotationQuaternion) {
                    if (!framePlaneMesh.rotationQuaternion) {
                        framePlaneMesh.rotationQuaternion = pickedMesh.rotationQuaternion.clone();
                    }
                    else {
                        framePlaneMesh.rotationQuaternion.copyFrom(pickedMesh.rotationQuaternion);
                    }
                }
                else {
                    framePlaneMesh.rotation.copyFrom(pickedMesh.rotation);
                }
                break;
        }
    });

    //#endregion
})();
