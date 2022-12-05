import {
    Color3,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    TransformNode,
    Vector3,
} from "@babylonjs/core";

export class PianoKeys extends TransformNode {
    constructor() {
        super(`PianoKeys`);

        const keyTopGap = 20
        const keyOffsetX = 52.8 + keyTopGap / 2;
        const keyRadius = 24 //19.862536897868538;
        const keyCircumference = 122.4 + keyTopGap;

        const keyAngle = (keyX) => {
            keyX += keyOffsetX;
            keyX /= keyCircumference;
            return (2 * Math.PI * keyX) + Math.PI;
        }

        const buildKey = function (parent, props) {
            if (props.type === "white") {
                /*
                Props for building a white key should contain:
                note, topWidth, bottomWidth, topPositionX, wholePositionX, register, referencePositionX

                As an example, the props for building the middle C white key would be
                {type: "white", note: "C", topWidth: 1.4, bottomWidth: 2.3, topPositionX: -0.45, wholePositionX: -14.4, register: 4, referencePositionX: 0}
                */

                // Create bottom part
                const bottom = MeshBuilder.CreateBox("whiteKeyBottom", {width: props.bottomWidth, height: 1.5, depth: 10});

                // Create top part
                const top = MeshBuilder.CreateBox("whiteKeyTop", {width: props.topWidth, height: 1.5, depth: 8.75});
                top.position.z =  4.75;
                top.position.x += props.topPositionX;

                // Merge bottom and top parts
                // Parameters of Mesh.MergeMeshes: (arrayOfMeshes, disposeSource, allow32BitsIndices, meshSubclass, subdivideWithSubMeshes, multiMultiMaterials)
                // const key = Mesh.MergeMeshes([bottom, top], true, false, null, false, false);
                const key = Mesh.MergeMeshes([bottom, top], true, false, null, false, false);
                const keyX = props.referencePositionX + props.wholePositionX;
                key.position.y = -keyRadius;
                key.rotateAround(Vector3.ZeroReadOnly, Vector3.LeftHandedForwardReadOnly, keyAngle(keyX));
                key.name = props.note + props.register;
                key.parent = parent;
                key.renderingGroupId = 2;
                key.isPickable = false;

                return key;
            }
            else if (props.type === "black") {
                /*
                Props for building a black key should contain:
                note, wholePositionX, register, referencePositionX

                As an example, the props for building the C#4 black key would be
                {type: "black", note: "C#", wholePositionX: -13.45, register: 4, referencePositionX: 0}
                */

                // Create black color material
                const blackMat = new StandardMaterial("black");
                blackMat.diffuseColor = new Color3(0, 0, 0);

                // Create black key
                const key = MeshBuilder.CreateBox(props.note + props.register, {width: 1.4, height: 3, depth: 8.75});
                key.position.z = 4.75;
                key.position.y = -keyRadius;
                const keyX = props.referencePositionX + props.wholePositionX;
                key.rotateAround(Vector3.ZeroReadOnly, Vector3.LeftHandedForwardReadOnly, keyAngle(keyX));
                key.material = blackMat;
                key.parent = parent;
                key.renderingGroupId = 2;
                key.isPickable = false;

                return key;
            }
        }

        const keyParams = [
            {type: "white", note: "C", topWidth: 1.4, bottomWidth: 2.3, topPositionX: -0.45, wholePositionX: -14.4},
            {type: "black", note: "C#", wholePositionX: -13.45},
            {type: "white", note: "D", topWidth: 1.4, bottomWidth: 2.4, topPositionX: 0, wholePositionX: -12},
            {type: "black", note: "D#", wholePositionX: -10.6},
            {type: "white", note: "E", topWidth: 1.4, bottomWidth: 2.3, topPositionX: 0.45, wholePositionX: -9.6},
            {type: "white", note: "F", topWidth: 1.3, bottomWidth: 2.4, topPositionX: -0.55, wholePositionX: -7.2},
            {type: "black", note: "F#", wholePositionX: -6.35},
            {type: "white", note: "G", topWidth: 1.3, bottomWidth: 2.3, topPositionX: -0.2, wholePositionX: -4.8},
            {type: "black", note: "G#", wholePositionX: -3.6},
            {type: "white", note: "A", topWidth: 1.3, bottomWidth: 2.3, topPositionX: 0.2, wholePositionX: -2.4},
            {type: "black", note: "A#", wholePositionX: -0.85},
            {type: "white", note: "B", topWidth: 1.3, bottomWidth: 2.4, topPositionX: 0.55, wholePositionX: 0},
        ]

        // Register 1 through 7
        var referencePositionX = -2.4*14;
        for (let register = 1; register <= 7; register++) {
            keyParams.forEach(key => {
                buildKey(this, Object.assign({register: register, referencePositionX: referencePositionX}, key));
            })
            referencePositionX += 2.4*7;
        }

        // Register 0
        buildKey(this, {type: "white", note: "A", topWidth: 1.9, bottomWidth: 2.3, topPositionX: -0.20, wholePositionX: -2.4, register: 0, referencePositionX: -2.4*21});
        keyParams.slice(10, 12).forEach(key => {
            buildKey(this, Object.assign({register: 0, referencePositionX: -2.4*21}, key));
        })

        // Register 8
        buildKey(this, {type: "white", note: "C", topWidth: 2.3, bottomWidth: 2.3, topPositionX: 0, wholePositionX: -2.4*6, register: 8, referencePositionX: 84});

        this.rotateAround(Vector3.ZeroReadOnly, Vector3.RightReadOnly, -Math.PI / 2);
        this.scaling.setAll(0.0175);
        this.position.y += 0.2;
    }
}
