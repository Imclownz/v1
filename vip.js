/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v43.0
 * Architecture: Supreme Hybrid (Kinetic Intercept + RegEx Predator)
 * Core Base: vip 2.js (Restored & Supercharged)
 * Status: Maximum Drag & Lock. Update-Proof. High-Speed Combat Ready.
 */

// ==========================================
// 1. UTILS: TOÁN HỌC KHÔNG GIAN & DỰ ĐOÁN
// Kế thừa từ vip 2.js và nâng cấp Dynamic Prediction
// ==========================================
class AdvancedMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value)); //
    }

    static getGoldenRatio() {
        return 0.68; // Tọa độ chuẩn trán
    }

    static calculateDynamicYOffset(distance) {
        const BASE_OFFSET = this.getGoldenRatio();
        const MAX_DISTANCE = 150.0;
        if (distance <= 0) return BASE_OFFSET;
        if (distance >= MAX_DISTANCE) return BASE_OFFSET * 0.3; //
        
        const scaleFactor = 1 - (distance / MAX_DISTANCE);
        return BASE_OFFSET * (0.3 + (0.7 * scaleFactor)); //
    }

    static predictIntercept(pos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 9999.0;
        const timeOffset = (distance / BULLET_SPEED) + (pingMs / 1000) + 0.05; 
        return {
            x: pos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: pos.y + ((targetVel.y - selfVel.y) * timeOffset),
            z: pos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

// ==========================================
// 2. LỚP BẢO VỆ 1: REGEX PREDATOR ENGINE
// Xử lý siêu tốc các gói tin cấu hình thô (ABHotUpdates, metadata)
// ==========================================
class RegExPredator {
    constructor() {
        this.voidWeight = "-50000.0"; 
        this.quantumLock = "50000.0";
        this.maxRadius = "8.0";
    }

    mutate(payloadStr) {
        let mutated = payloadStr;

        // Xóa sổ độ giật và độ nở tâm tĩnh/động
        mutated = mutated.replace(/"(recoil|recoil_base|spread_base|progressive_spread|bloom|camera_shake|recoil_accumulation|horizontal_recoil|vertical_recoil)":\s*-?\d+(\.\d+)?/gi, '"$1": 0.0');
        
        // Triệt tiêu phạt di chuyển (Run & Gun, Jump-shot)
        mutated = mutated.replace(/"(movement_penalty|jump_penalty|strafe_penalty)":\s*-?\d+(\.\d+)?/gi, '"$1": 0.0');

        // Bẻ gãy lực hút thân dưới và ma sát
        mutated = mutated.replace(/"(spine|spine1|spine2|chest|pelvis|hips|left_arm|right_arm)":\s*\{([^}]*?)"snap_weight":\s*-?\d+(\.\d+)?/gi, '"$1": {$2"snap_weight": ' + this.voidWeight);
        mutated = mutated.replace(/"(spine|spine1|spine2|chest|pelvis|hips)":\s*\{([^}]*?)"friction":\s*\d+(\.\d+)?/gi, '"$1": {$2"friction": 0.0');

        // Phóng đại vùng Đầu thành hố đen từ tính
        mutated = mutated.replace(/"(head)":\s*\{([^}]*?)"snap_weight":\s*-?\d+(\.\d+)?/gi, '"$1": {$2"snap_weight": ' + this.quantumLock);
        mutated = mutated.replace(/"(head)":\s*\{([^}]*?)"m_Radius":\s*\d+(\.\d+)?/gi, '"$1": {$2"m_Radius": ' + this.maxRadius);
        
        return mutated;
    }
}

// ==========================================
// 3. LỚP BẢO VỆ 2: KINETIC JSON ENGINE
// Xử lý động lực học tọa độ mục tiêu (Kế thừa cốt lõi vip 2.js)
// ==========================================
class KineticJSONEngine {
    constructor() {
        this.hyperVoid = -50000.0;
        this.hyperLock = 50000.0;
    }

    enforceZeroRecoil(weapon) {
        if (!weapon) return;
        weapon.recoil = 0.0;
        weapon.spread = 0.0;
        weapon.camera_shake = 0.0;
        weapon.progressive_spread = 0.0;
        weapon.recoil_accumulation = 0.0;
        weapon.horizontal_recoil = 0.0;
        weapon.bloom = 0.0;
        weapon.movement_penalty = 0.0;
        weapon.jump_penalty = 0.0;
    }

    spoofBoneIDs(hitboxes) { //
        if (!hitboxes) return;
        const torso = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let i = 0; i < torso.length; i++) { //
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.hyperVoid; //
                hitboxes[bone].priority = "IGNORE"; //
                hitboxes[bone].m_Radius = 0.001; //
                hitboxes[bone].friction = 0.0;
            }
        }
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.hyperLock;
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 8.0;
        }
    }

    teleportCenterOfMass(player, selfVel, ping) {
        if (!player || !player.head_pos || !player.chest_pos) return; //

        const dist = player.distance || 15.0;
        const targetVel = player.velocity || { x: 0, y: 0, z: 0 };
        const deltaY = AdvancedMath.calculateDynamicYOffset(dist); //
        
        const predictedHead = AdvancedMath.predictIntercept(player.head_pos, targetVel, selfVel, dist, ping);

        if (player.center_of_mass) { //
            // Dịch chuyển X, Z chặn đầu hướng di chuyển
            player.center_of_mass.x = predictedHead.x;
            player.center_of_mass.z = predictedHead.z;
            
            // Ép trục Y lên chuẩn trán
            player.center_of_mass.y = player.chest_pos.y + deltaY; //
            
            // Clamping tuyệt đối: Chống vọt qua đỉnh đầu
            const absoluteMaxY = player.head_pos.y + 0.15;
            player.center_of_mass.y = AdvancedMath.clamp(player.center_of_mass.y, player.chest_pos.y, absoluteMaxY); //
        }
    }

    process(dataObj) {
        if (!dataObj) return dataObj;

        if (dataObj.weapon) this.enforceZeroRecoil(dataObj.weapon);

        if (Array.isArray(dataObj.players)) { //
            const selfVel = dataObj.player_velocity || { x: 0, y: 0, z: 0 };
            const pingMs = dataObj.ping || 20;

            for (let i = 0; i < dataObj.players.length; i++) { //
                const enemy = dataObj.players[i]; //
                this.spoofBoneIDs(enemy.hitboxes); //
                this.teleportCenterOfMass(enemy, selfVel, pingMs);
            }
        }

        if (dataObj.players && dataObj.players.length > 0 && dataObj.camera_state) {
            dataObj.camera_state.stickiness = 1.0;
            dataObj.camera_state.interpolation = "ZERO";
            dataObj.camera_state.lock_bone = "bone_Head";
        }

        return dataObj;
    }
}

// ==========================================
// 4. BỘ ĐIỀU PHỐI TỐI CAO (SUPREME COORDINATOR)
// ==========================================
class SupremeCoordinator {
    constructor() {
        this.regexEngine = new RegExPredator();
        this.jsonEngine = new KineticJSONEngine();
    }

    execute(bodyString) {
        // Lớp 1: Càn quét RegEx (Hiệu quả với ABHotUpdates)
        let processedString = this.regexEngine.mutate(bodyString);

        // Lớp 2: Nội suy Json (Hiệu quả với Real-time combat sync)
        try {
            let dataObj = JSON.parse(processedString); //
            dataObj = this.jsonEngine.process(dataObj);
            return JSON.stringify(dataObj); //
        } catch (error) { //
            // Fallback an toàn nếu không phải mảng JSON hợp lệ
            return processedString; 
        }
    }
}

// ==========================================
// 5. SHADOWROCKET INTERCEPTOR (ENTRY POINT)
// ==========================================
const SystemV43 = new SupremeCoordinator();

if (typeof $response !== "undefined" && $response.body) { //
    $done({ body: SystemV43.execute($response.body) }); //
}
