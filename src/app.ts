import {
    AbstractMesh,
    Color3,
    CubeTexture,
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
    Texture,
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
        scene.collisionsEnabled = true;
        scene.gravity = new Vector3(0, -0.15, 0);

        const camera = new FreeCamera(`camera`, new Vector3(0, 2, 0));
        camera.applyGravity = true;
        camera.checkCollisions = true;
        camera.ellipsoid = new Vector3(1, 1, 1);
        camera.minZ = 0;
        camera.keysDown.push(83); // S
        camera.keysDownward.push(81); // Q
        camera.keysLeft.push(65); // A
        camera.keysRight.push(68); // D
        camera.keysUp.push(87); // W
        camera.keysUpward.push(69); // E
        camera.speed = 0.25;
        camera.attachControl();
        camera.setTarget(new Vector3(0, 2, -5));

        let daySkyBox = MeshBuilder.CreateBox(`daySkyBox`, { size:1000 }, scene);
        daySkyBox.renderingGroupId = 0;
        let daySkyBoxMaterial = new StandardMaterial(`daySkyBoxMaterial`, scene);
        daySkyBoxMaterial.backFaceCulling = false;
        daySkyBoxMaterial.reflectionTexture = new CubeTexture("skyboxes/day/", scene);
        daySkyBoxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        daySkyBoxMaterial.diffuseColor = new Color3(0, 0, 0);
        daySkyBoxMaterial.specularColor = new Color3(0, 0, 0);
        daySkyBox.material = daySkyBoxMaterial;

        const ground = MeshBuilder.CreateGround(`ground`, {width: 20, height: 20});
        ground.checkCollisions = true;
        ground.isPickable = false;

        const wallMaterial = new StandardMaterial(`Wall.material`);
        wallMaterial.alpha = 0.25;
        wallMaterial.diffuseColor.set(0.75, 0.75, 0.75);

        for (let i = 0; i < 4; i++) {
            // Create simulated wall with final rotation y and z matching detected wall planes so the correct xform is
            // used when placing the frame.
            const wall = MeshBuilder.CreatePlane(`Wall`);
            wall.checkCollisions = true;
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
            wall.renderingGroupId = 3;
            wall.material = wallMaterial;

            const planeContext = new PlaneContext;
            planeContext.mesh = wall;
            planeContext.isVertical = true;
            planeMeshMap.set(wall, planeContext);
        }
    }

    let nightSkyBox = MeshBuilder.CreateBox(`nightSkyBox`, { size:2000 }, scene);
    nightSkyBox.renderingGroupId = 2;
    nightSkyBox.rotation.y = Math.PI / 2;
    nightSkyBox.rotation.z = -Math.PI / 2;
    let nightSkyBoxMaterial = new StandardMaterial(`nightSkyBoxMaterial`, scene);
    nightSkyBoxMaterial.backFaceCulling = false;
    nightSkyBoxMaterial.reflectionTexture = new CubeTexture("skyboxes/night/", scene);
    nightSkyBoxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    nightSkyBoxMaterial.diffuseColor = new Color3(0, 0, 0);
    nightSkyBoxMaterial.specularColor = new Color3(0, 0, 0);
    nightSkyBox.material = nightSkyBoxMaterial;

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

                if (useWebXR) {
                    frameTransform.scaling.setAll(1);
                    frameTransform.position.copyFrom(pointerInfo.pickInfo.pickedPoint);
                }
                else {
                    frameTransform.scaling.setAll(4);
                    frameTransform.position.copyFrom(pointerInfo.pickInfo.pickedPoint);
                    frameTransform.position.y = 2;
                }
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

    const scoreNotes = scoreJson.score;

    let maxNoteDuration = 0;

    // Trim overlapping notes and find max note duration.
    for (let i = 0; i < scoreNotes.length; i++) {
        const note = scoreNotes[i].note;
        for (let j = i + 1; j < scoreNotes.length; j++) {
            const futureNote = scoreNotes[j].note;
            if (futureNote.pitch === note.pitch && futureNote.onTime < note.offTime) {
                note.offTime = futureNote.onTime;
                break;
            }
            if (note.offTime <= scoreNotes[j].note.onTime) {
                break;
            }
        }
        maxNoteDuration = Math.max(maxNoteDuration, note.offTime - note.onTime);
    }

    const createNoteMesh = (onTime: number, duration: number, angle: number): Mesh => {
        const mesh = MeshBuilder.CreateCylinder(`noteMesh.prototype`, {
            height: duration,
            diameterBottom: 1,
            diameterTop: 0 // 1 - duration / maxNoteDuration
        });
        mesh.position.x = pianoKeys.radius - 2;
        mesh.position.y = onTime + duration / 2;
        mesh.rotateAround(Vector3.ZeroReadOnly, Vector3.UpReadOnly, angle);
        mesh.bakeCurrentTransformIntoVertices();
        mesh.scaling.copyFrom(pianoKeys.scaling);
        mesh.scaling.y = 0.5;
        return mesh;
    }

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
