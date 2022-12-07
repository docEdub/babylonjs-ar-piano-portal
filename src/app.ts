import {
    AbstractMesh,
    Color3,
    Engine,
    FreeCamera,
    HemisphericLight,
    IWebXRPlane,
    Material,
    Matrix,
    Mesh,
    MeshBuilder,
    Plane,
    PointerEventTypes,
    PolygonMeshBuilder,
    Quaternion,
    Scene,
    StandardMaterial,
    TransformNode,
    Vector2,
    Vector3,
    VertexBuffer,
    WebXRDefaultExperience,
    WebXRFeaturesManager,
    WebXRPlaneDetector,
    WebXRSessionManager
} from "@babylonjs/core";

import "@babylonjs/loaders";
import earcut from "earcut";
import { PianoKeys } from "./pianoKeys"

import * as scoreJson from "./score.json"

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

    //#region Setup WebXR

    let useWebXR = true;

    if (!await WebXRSessionManager.IsSessionSupportedAsync("immersive-ar")) {
        console.log("Session mode \"immersive-ar\" not available.");
        useWebXR = false;
    }

    const xrAvailableFeatures = WebXRFeaturesManager.GetAvailableFeatures();
    if (xrAvailableFeatures.indexOf(WebXRPlaneDetector.Name) === -1) {
        console.log(`${WebXRPlaneDetector.Name} not available.`);
        useWebXR = false;
    }

    let xr: WebXRDefaultExperience = null;
    if (useWebXR) {
        xr = await scene.createDefaultXRExperienceAsync({
            inputOptions: {
                doNotLoadControllerMeshes: true
            },
            uiOptions: {
                sessionMode: "immersive-ar",
                referenceSpaceType: "local-floor"
            },
            optionalFeatures: true
        });
    }

    if (useWebXR && !xr.baseExperience) {
        console.log("WebXR not available.");
        useWebXR = false;
    }

    //#endregion

    // TODO: See if light estimation can work for WebXR experience instead using the stock hemispheric light.
    const light = new HemisphericLight(`light`, new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    if (!useWebXR) {
        const camera = new FreeCamera(`camera`, new Vector3(0, 2, 10));
        camera.speed = 0.25;
        camera.setTarget(new Vector3(0, 2, 0));
        camera.attachControl();
        const ground = MeshBuilder.CreateGround(`ground`, {width: 20, height: 20});
        ground.isPickable = false;

        camera.keysUpward.push(69); // E
        camera.keysDownward.push(81); // Q
        camera.keysUp.push(87); // W
        camera.keysLeft.push(65); // A
        camera.keysDown.push(83); // S
        camera.keysRight.push(68); // D
    }

    //#region Room setup plane processing
    // See https://playground.babylonjs.com/#98TM63.

    class PlaneContext {
        public mesh: Mesh = null;
        public isVertical = false;
    }

    const planeMeshMap = new Map<AbstractMesh, PlaneContext>();

    if (useWebXR) {
        const xrPlaneMap = new Map<IWebXRPlane, PlaneContext>();

        const xrFeaturesManager = xr.baseExperience.featuresManager;
        const xrPlaneDetectorFeature = <WebXRPlaneDetector>xrFeaturesManager.enableFeature(WebXRPlaneDetector.Name, "latest");
        xrPlaneDetectorFeature.onPlaneAddedObservable.add(plane => {
            const planeContext = new PlaneContext;
            planeContext.isVertical = plane.xrPlane.orientation.toLocaleLowerCase() === "vertical";

            plane.polygonDefinition.push(plane.polygonDefinition[0]);
            const polygon_triangulation = new PolygonMeshBuilder("Wall", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
            const mesh = polygon_triangulation.build(false, 0.01);
            mesh.renderingGroupId = 0;
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
                planeContext.isVertical = plane.xrPlane.orientation.toLocaleLowerCase() === "vertical";
            }

            plane.polygonDefinition.push(plane.polygonDefinition[0]);
            const polygon_triangulation = new PolygonMeshBuilder("Wall", plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
            const mesh = polygon_triangulation.build(false, 0.01);
            mesh.renderingGroupId = 0;
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
    }
    else { // useWebXR == false
        const wallMaterial = new StandardMaterial(`Wall.material`);
        wallMaterial.diffuseColor.set(0.75, 0.75, 0.75);

        for (let i = 0; i < 4; i++) {
            // Create simulated wall with final rotation y and z matching detected wall planes so the correct xform is
            // used when placing the frame.
            const wall = MeshBuilder.CreatePlane(`Wall`);
            wall.rotation.z = Math.PI / 2;
            wall.rotation.y = Math.PI / 2;
            wall.rotation.x = -Math.PI / 2;
            wall.bakeCurrentTransformIntoVertices();
            wall.rotation.z = -Math.PI / 2;
            wall.rotation.y = -Math.PI / 2;
            wall.rotation.x = Math.PI / 2;
            wall.position.y = 2;
            wall.position.z = 10;
            wall.scaling.x = wall.scaling.y = 2 * wall.position.z;
            wall.scaling.z = 2 * wall.position.y;
            wall.rotateAround(Vector3.ZeroReadOnly, Vector3.UpReadOnly, Math.PI / 2 * i);
            wall.renderingGroupId = 0;
            wall.material = wallMaterial;

            const planeContext = new PlaneContext;
            planeContext.mesh = wall;
            planeContext.isVertical = true;
            planeMeshMap.set(wall, planeContext);
        }
    }

    //#endregion

    //#region Magic portal

    const frameTransform = new TransformNode("Frame.transform");
    frameTransform.scaling.setAll(0);

    const clipPlane = new Plane(0, 0, -1, -10);

    const framePlaneMesh = MeshBuilder.CreatePlane("Frame");
    framePlaneMesh.rotation.x = -Math.PI / 2;
    framePlaneMesh.bakeCurrentTransformIntoVertices();
    framePlaneMesh.isPickable = false;
    framePlaneMesh.parent = frameTransform;
    const framePlaneMaterial = new StandardMaterial(`Frame.material`);
    framePlaneMaterial.disableDepthWrite = true;
    framePlaneMesh.material = framePlaneMaterial;

    // Use `framePlaneMesh` as a stencil so nothing gets drawn outside of it.
    // This creates the magic portal effect.
    framePlaneMesh.renderingGroupId = 1;
    // cylinder.renderingGroupId = 2;
    scene.setRenderingAutoClearDepthStencil(2, false);
    scene.setRenderingAutoClearDepthStencil(3, true);
    engine.setStencilBuffer(true);
    scene.onBeforeRenderingGroupObservable.add((groupInfo) => {
        switch (groupInfo.renderingGroupId) {
            case 2:
                engine.setDepthFunction(Engine.LESS);
                engine.setStencilFunction(Engine.EQUAL);
                break;
            // case 0:
            case 3:
                scene.clipPlane = clipPlane;
            default:
                engine.setDepthFunction(Engine.LESS);
                engine.setStencilFunction(Engine.ALWAYS);
        }
    });
    scene.onAfterRenderingGroupObservable.add((groupInfo) => {
        switch (groupInfo.renderingGroupId) {
            // case 0:
            case 3:
                scene.clipPlane = null;
        }
    });

    //#endregion

    //#region Pointer processing

    scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                const pickedMesh = pointerInfo.pickInfo.pickedMesh;
                if (!pickedMesh) {
                    return;
                }
                if (!planeMeshMap.has(pickedMesh)) {
                    console.debug(`Picked plane mesh (\"${pickedMesh.name}\") not found in planeMeshMap.`);
                    return;
                }
                const planeContext = planeMeshMap.get(pickedMesh);
                if (!planeContext.isVertical) {
                    console.debug(`Plane orientation is not vertical.`);
                    return;
                }

                // TODO: Add logic to keep frame from overlapping with floor, ceiling or another wall.

                frameTransform.scaling.setAll(1);
                frameTransform.position.copyFrom(pointerInfo.pickInfo.pickedPoint);
                // clipPlane.d = -frameTransform.position.length();
                const vertices = pickedMesh.getVerticesData(VertexBuffer.PositionKind);
                clipPlane.copyFromPoints(
                    Vector3.TransformCoordinates(new Vector3(vertices[0], vertices[1], vertices[2]), pickedMesh.getWorldMatrix()),
                    Vector3.TransformCoordinates(new Vector3(vertices[3], vertices[4], vertices[5]), pickedMesh.getWorldMatrix()),
                    Vector3.TransformCoordinates(new Vector3(vertices[6], vertices[7], vertices[8]), pickedMesh.getWorldMatrix())
                )
                if (pickedMesh.rotationQuaternion) {
                    if (!frameTransform.rotationQuaternion) {
                        frameTransform.rotationQuaternion = pickedMesh.rotationQuaternion.clone();
                    }
                    else {
                        frameTransform.rotationQuaternion.copyFrom(pickedMesh.rotationQuaternion);
                    }
                    // clipPlane.normal.set(0, 1, 0);
                    // clipPlane.normal.applyRotationQuaternionInPlace(pickedMesh.rotationQuaternion);
                    console.debug(`clipPlane =`, clipPlane);
                }
                else {
                    frameTransform.rotation.copyFrom(pickedMesh.rotation);
                    Vector3.TransformCoordinatesToRef(clipPlane.normal, frameTransform.getWorldMatrix(), clipPlane.normal);
                }
                break;
        }
    });

    //#endregion

    const noteMeshes = [];

    const pianoKeys = new PianoKeys;
    pianoKeys.parent = frameTransform;

    const createNoteMesh = (onTime: number, duration: number, angle: number): Mesh => {
        const mesh = MeshBuilder.CreateCylinder(`noteMesh.prototype`, {
            height: duration,
            diameterBottom: 1,
            diameterTop: 0
        });
        // mesh.rotation.x = Math.PI / 2;
        mesh.position.x = pianoKeys.radius - 2;
        mesh.position.y = onTime;
        mesh.rotateAround(Vector3.ZeroReadOnly, Vector3.UpReadOnly, angle);
        mesh.bakeCurrentTransformIntoVertices();
        mesh.scaling.copyFrom(pianoKeys.scaling);
        mesh.scaling.y = 0.5;
        return mesh;
    }

    const scoreNotes = scoreJson.score;
    for (let i = 0; i < scoreNotes.length; i++) {
        const note = scoreNotes[i].note;
        noteMeshes.push(createNoteMesh(note.onTime, note.offTime - note.onTime, pianoKeys.keyAngle(note.pitch)));
    }

    const scoreMeshTransform = new TransformNode(`scoreMeshTransform`);
    scoreMeshTransform.parent = frameTransform;

    const scoreMeshInFrame = Mesh.MergeMeshes(noteMeshes, true, true);
    scoreMeshInFrame.name = `scoreMeshInFrame`;
    scoreMeshInFrame.renderingGroupId = 2;
    scoreMeshInFrame.parent = scoreMeshTransform;
    scoreMeshInFrame.rotation.y = -Math.PI / 2;
    const scoreMaterial = new StandardMaterial(`scoreMaterial`);
    scoreMaterial.diffuseColor.set(1, 0.2, 0.5);
    scoreMeshInFrame.material = scoreMaterial;

    const scoreMeshOutOfFrame = scoreMeshInFrame.clone(`scoreMeshOutOfFrame`);
    scoreMeshOutOfFrame.parent = scoreMeshTransform;
    scoreMeshOutOfFrame.renderingGroupId = 3;

    scene.onBeforeRenderObservable.add(() => {
        scoreMeshTransform.position.y -= engine.getDeltaTime() / 1000;
    })

    scoreMeshTransform.position.y -= 10;
})();
