/**
 * ENTERPRISE-GRADE: TARGETING SYSTEM v39.5 (APEX)
 * Focus: Immediate Displacement (Drag-to-Head) & Sticky-Lock
 * Base: vip 2.js logic
 */

class ApexTargetingEngine {
    constructor() {
        this.config = {
            bulletSpeed: 9999.0, // Hit-scan
            goldenRatio: 0.68, // Khóa vùng trán
            maxStickiness: 1.0, // Khóa cứng tuyệt đối
            zeroSmoothing: "ZERO" // Dịch chuyển tức thời
        };
    }

    /**
     * TRUYỀN TINH THẦN TỪ VIP 2.JS: Xóa lực hút thân, dồn vào đầu
     */
    hijackMagnetism(enemy) {
        if (!enemy.hitboxes) return;
        const voidWeight = -99999.0;
        const maxWeight = 99999.0;

        // Triệt tiêu thân dưới
        const bones = ['spine', 'chest', 'pelvis', 'hips'];
        bones.forEach(b => {
            if (enemy.hitboxes[b]) {
                enemy.hitboxes[b].snap_weight = voidWeight;
                enemy.hitboxes[b].priority = "IGNORE";
            }
        });

        // Cường hóa đầu
        if (enemy.hitboxes.head) {
            enemy.hitboxes.head.snap_weight = maxWeight;
            enemy.hitboxes.head.priority = "MAXIMUM";
            enemy.hitboxes.head.m_Radius *= 5.0; 
        }
    }

    /**
     * KHẮC PHỤC LỆCH ĐẠN TIỂU LIÊN: Triệt tiêu biến số động
     */
    stabilizeWeapon(weapon) {
        if (!weapon) return;
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.progressive_spread = 0.0; // Chặn nở tâm
        weapon.recoil_accumulation = 0.0; // Chặn cộng dồn giật
        weapon.bloom = 0.0;
    }

    /**
     * LOGIC DỊCH CHUYỂN (DISPLACEMENT): Snap trực tiếp đến đầu
     */
    calculateSnapPoint(player) {
        if (!player.head_pos || !player.chest_pos) return null;

        const headHeight = player.hitboxes?.head?.m_Height || 0.2;
        // Tính toán tọa độ trán
        const targetY = player.head_pos.y + (headHeight * this.config.goldenRatio);

        return {
            x: player.head_pos.x,
            y: targetY,
            z: player.head_pos.z
        };
    }

    processFrame(data) {
        if (!data) return data;

        // 1. Luôn ổn định súng để đạn đi theo tâm ngắm
        if (data.weapon) this.stabilizeWeapon(data.weapon);

        if (data.players && data.players.length > 0) {
            data.players.sort((a, b) => a.distance - b.distance);
            const target = data.players[0];

            // 2. Thực thi luật từ tính từ vip 2.js
            this.hijackMagnetism(target);

            // 3. Tính toán điểm Snap
            const snapPoint = this.calculateSnapPoint(target);

            // 4. KÍCH HOẠT DỊCH CHUYỂN VÀ DUY TRÌ KHÓA (Logic v31.0)
            // Việc thiết lập interpolation: "ZERO" sẽ ép tâm dịch chuyển ngay lập tức
            data.camera_state = {
                forced_target: snapPoint,
                lock_bone: "bone_Head",
                stickiness: this.config.maxStickiness,
                interpolation: this.config.zeroSmoothing 
            };
        }
        return data;
    }
}

const ApexEngine = new ApexTargetingEngine();

function interceptAndProcessPacket(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const processedPayload = ApexEngine.processFrame(payload);
        return JSON.stringify(processedPayload);
    } catch (e) {
        return bodyString; 
    }
}

if (typeof $response !== "undefined" && $response.body) {
    $done({ body: interceptAndProcessPacket($response.body) });
}
