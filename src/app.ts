import {
    Engine,
    InstancedMesh,
    MeshBuilder,
    Scene,
    StandardMaterial,
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
    })

    //#endregion
})();
