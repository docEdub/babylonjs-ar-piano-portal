import {
    Engine,
    InstancedMesh,
    Matrix,
    Mesh,
    MeshBuilder,
    Nullable,
    Scene,
    StandardMaterial,
    VertexBuffer,
    WebXRFeatureName,
    WebXRHand,
    WebXRHandTracking
} from "@babylonjs/core";

import "@babylonjs/loaders";

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

    //#region Setup WebXR AR with hand and room setup plane tracking

    // Setup AR.
    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
            sessionMode: "immersive-ar",
            referenceSpaceType: "local-floor"
        },
        optionalFeatures: [ "plane-detection" ]
    });

    // Disable hand pointer rays/beams.
    xr.pointerSelection.detach();

    // Capture hand joint meshes as they're created so we can track their positions in the render loop.
    const xrLeftHandJointMeshes = Array<InstancedMesh>(25);
    const xrRightHandJointMeshes = Array<InstancedMesh>(25);
    const onXrHandJointMeshGenerated = (instance: InstancedMesh, jointId: number, hand: XRHandedness) => {
        const xrHandJointMeshes = hand === "left" ? xrLeftHandJointMeshes : xrRightHandJointMeshes;
        xrHandJointMeshes[jointId] = instance;
        return instance;
    }

    // Setup hand tracking.
    const xrFeaturesManager = xr.baseExperience.featuresManager;
    const xrHandFeature = <WebXRHandTracking>xrFeaturesManager.enableFeature(WebXRFeatureName.HAND_TRACKING, "latest", {
        xrInput: xr.input,
        jointMeshes: {
            disableDefaultHandMesh: false,
            onHandJointMeshGenerated: onXrHandJointMeshGenerated,
        }
    });

    // Capture hand objects as they're created so we can track gamepad button presses in the render loop that indicate
    // the thumb and forefinger are touching.
    let xrLeftHand: WebXRHand = null;
    let xrRightHand: WebXRHand = null;
    xrHandFeature.onHandAddedObservable.add((hand) => {
        if (hand.xrController.inputSource.handedness === "left") {
            xrLeftHand = hand;
        }
        else if (hand.xrController.inputSource.handedness === "right") {
            xrRightHand = hand;
        }
    });

    // Flags set to `true` when each hand's thumb and forefinger are touching; otherwise `false`.
    let isLeftThumbTouchingForefinger = false;
    let isRightThumbTouchingForefinger = false;
    scene.registerBeforeRender(() => {
        if (xrLeftHand?.xrController?.inputSource?.gamepad?.buttons[0]?.pressed) {
            if (!isLeftThumbTouchingForefinger) {
                isLeftThumbTouchingForefinger = true;
            }
        }
        else if (isLeftThumbTouchingForefinger) {
            isLeftThumbTouchingForefinger = false;
        }
        if (xrRightHand?.xrController?.inputSource?.gamepad?.buttons[0]?.pressed) {
            if (!isRightThumbTouchingForefinger) {
                isRightThumbTouchingForefinger = true;
            }
        }
        else if (isRightThumbTouchingForefinger) {
            isRightThumbTouchingForefinger = false;
        }
    });

    //#endregion

    //#region Room setup plane processing
    // See https://github.com/cabanier/webxr-samples-1/blob/main/proposals/plane-detection-2.html

    class PlaneContext {
        public id: number = -1;
        public timestamp: number = -1;
        public mesh: Mesh = MeshBuilder.CreatePlane("Room plane", { size: 1 });

        public update(polygon: DOMPointReadOnly[]) {
            const vertexBuffer = this.mesh.getVerticesData(VertexBuffer.PositionKind);
            let j = 0;
            for (let i = 0; i < 4; i++) {
                vertexBuffer[j++] = polygon[i].x;
                vertexBuffer[j++] = polygon[i].z;
                vertexBuffer[j++] = 0;
            }
            this.mesh.updateVerticesData(VertexBuffer.PositionKind, vertexBuffer);
        }

        constructor(polygon) {
            this.update(polygon);

            const material = new StandardMaterial("Room plane material");
            material.backFaceCulling = false;
            material.emissiveColor.set(0.5, 0.05, 0.5)
            this.mesh.material = material;
        }
    }

    const planeMap = new Map<XRPlane, PlaneContext>();

    xr.baseExperience.sessionManager.onXRFrameObservable.add((frame: XRFrame) => {
        const referenceSpace = xr.baseExperience.sessionManager.referenceSpace;

        if (frame.detectedPlanes) {
            // Delete planes from plane map if they don't exist anymore.
            planeMap.forEach((planeContext, plane) => {
                if (!frame.detectedPlanes.has(plane)) {
                    planeMap.delete(plane);
                }
            });

            // Add new planes to plane map.
            frame.detectedPlanes.forEach(plane => {
                const pose = frame.getPose(plane.planeSpace, referenceSpace);

                // Update existing plane if already added.
                let planeContext: PlaneContext;
                if (planeMap.has(plane)) {
                    planeContext = planeMap.get(plane);
                    planeContext.update(plane.polygon);
                }
                else {
                    planeContext = new PlaneContext(plane.polygon)
                    planeMap.set(plane, planeContext);
                }

                if (pose) {
                    planeContext.mesh.isVisible = true;
                    Matrix.FromArrayToRef(pose.transform.matrix, 0, planeContext.mesh.getWorldMatrix());
                }
                else {
                    planeContext.mesh.isVisible = false;
                }
            });
        }
    });

    //#endregion
})();
