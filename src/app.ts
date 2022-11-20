import {
    Engine,
    InstancedMesh,
    Matrix,
    Mesh,
    MeshBuilder,
    Nullable,
    Scene,
    StandardMaterial,
    Texture as BabylonTexture,
    VertexData,
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
            referenceSpaceType: "local"
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

    const planeVertexPositions = [
        -1, 0, -1,
        1, 0, -1,
        1, 0, 1,
        -1, 0, 1
    ];

    const planeVertexIndices = [
        0, 2, 1,
        0, 3, 2
    ];

    const planeVertexUVs = [
        0, 1,
        1, 1,
        1, 0,
        0, 0
    ]

    class Texture extends BabylonTexture {
        public static LoadFromSvgString = (svgString: string) => {
            // Setting a unique name is required otherwise the first texture created gets used all the time.
            // See https://forum.babylonjs.com/t/why-does-2nd-texture-use-first-svg/23975.
            Texture._svgTextureCount++
            const name = Texture._svgTextureCount.toString()
            const texture = Texture.LoadFromDataString(name, 'data:image/svg+xml;base64,' + window.btoa(svgString), Engine.LastCreatedScene!)
            texture.onLoadObservable.addOnce(() => {
                texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE)
            })
            return texture
        }

        private static _svgTextureCount = 0
    }

    const gridTexture = Texture.LoadFromSvgString(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
            <line x1="0" y1="0" x2="64" y2="0"/>
            <line x1="64" y1="0" x2="64" y2="64"/>
            <line x1="64" y1="64" x2="0" y2="64"/>
            <line x1="0" y1="64" x2="0" y2="0"/>
            <style>
                line {
                    fill: none;
                    stroke: #fff;
                    stroke-width: 4;
                }
            </style>
        </svg>
    `);

    gridTexture.uScale = gridTexture.vScale = 20;
    const gridMaterial = new StandardMaterial("Grid material");
    gridMaterial.ambientTexture = gridTexture;
    gridMaterial.backFaceCulling = false;
    gridMaterial.disableLighting = true;
    gridMaterial.emissiveColor.set(1, 1, 1);
    gridMaterial.opacityTexture = gridTexture;
    gridMaterial.alpha = 0.5;

    let nextPlaneId = 1;

    class PlaneContext {
        public id = -1;
        public timestamp = -1;
        public mesh = new Mesh("Room plane");
        public vertexData = new VertexData();

        public update(polygon: DOMPointReadOnly[]) {
            let j = 0;
            for (let i = 0; i < 4; i++) {
                this.vertexData.positions[j++] = polygon[i].x;
                this.vertexData.positions[j++] = 0;
                this.vertexData.positions[j++] = polygon[i].z;
            }
            this.vertexData.applyToMesh(this.mesh);
        }

        constructor(polygon) {
            this.id = nextPlaneId++;
            this.mesh.material = gridMaterial;
            this.vertexData.positions = planeVertexPositions;
            this.vertexData.indices = planeVertexIndices;
            this.vertexData.uvs = planeVertexUVs;
            this.update(polygon);
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
                    const matrix = planeContext.mesh.getWorldMatrix();
                    Matrix.FromArrayToRef(pose.transform.matrix, 0, matrix);
                    matrix.toggleModelMatrixHandInPlace();
                }
                else {
                    planeContext.mesh.isVisible = false;
                }
            });
        }
    });

    //#endregion
})();
