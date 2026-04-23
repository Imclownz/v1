/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v45.0
 * Architecture: Neck-Pivot Anchoring & Micro-Float Magnetism
 * Core Base: vip 2.js (Resolved Engine Normalization Traps)
 * Status: No Overshooting. No Chest Sticking. Native Track-Assist.
 */

class PrecisionAnchorEngine {
    constructor() {
        // Dùng số siêu nhỏ (Micro-floats) để bypass hàm chống hack của Unity
        this.ghostWeight = 0.0001;  // Tàng hình vùng thân
        this.ghostRadius = 0.0001; 
        
        // Lực hút đầu đủ mạnh để dính, nhưng không quá lố để tránh kẹt tâm
        this.magneticLock = 5000.0; 
        this.headRadiusMulti = 4.5; // Phóng to vừa đủ để bao trọn vùng cổ
    }

    /**
     * MODULE 1: MICRO-FLOAT WEAPON STABILIZATION
     * Không ép về 0 tuyệt đối để giữ lại độ mượt của Crosshair khi tracking
     */
    stabilizeWeapon(weapon) {
        if (!weapon) return;
        
        const microValue = 0.0001;
        
        if ('recoil' in weapon) weapon.recoil = microValue;
        if ('spread' in weapon) weapon.spread = microValue;
        if ('camera_shake' in weapon) weapon.camera_shake = 0.0;
        
        // Giữ cho SMG đầm tay, không bung tâm
        if ('progressive_spread' in weapon) weapon.progressive_spread = microValue;
        if ('recoil_accumulation' in weapon) weapon.recoil_accumulation = microValue;
        if ('recoil_multiplier' in weapon) weapon.recoil_multiplier = microValue;
        if ('bloom' in weapon) weapon.bloom = microValue;
        
        // Tắt hẳn phạt di chuyển để vừa chạy vừa sấy
        if ('movement_penalty' in weapon) weapon.movement_penalty = 0.0;
        if ('jump_penalty' in weapon) weapon.jump_penalty = 0.0;
    }

    /**
     * MODULE 2: GHOSTING BODY & MAGNETIZING HEAD
     */
    reconfigureMagnetism(hitboxes) { //
        if (!hitboxes) return;

        // Ép toàn bộ thân dưới thành "bóng ma" đối với tia Raycast của Aim Assist
        const torso = ['root', 'spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        for (let i = 0; i < torso.length; i++) {
            const bone = torso[i];
            if (hitboxes[bone]) {
                hitboxes[bone].snap_weight = this.ghostWeight; // Bypass bẫy số âm
                hitboxes[bone].priority = "LOW";
                hitboxes[bone].m_Radius = this.ghostRadius; 
                hitboxes[bone].friction = 0.0; // Triệt tiêu cảm giác rít khi kéo tâm
            }
        }

        // Cường hóa vùng Đầu
        if (hitboxes.head) {
            hitboxes.head.snap_weight = this.magneticLock;
            hitboxes.head.priority = "MAXIMUM"; //
            hitboxes.head.m_Radius *= this.headRadiusMulti;
        }
        
        // Mở rộng thêm vùng Cổ làm nam châm phụ
        if (hitboxes.neck) {
            hitboxes.neck.snap_weight = this.magneticLock / 2;
            hitboxes.neck.priority = "HIGH";
        }
    }

    /**
     * MODULE 3: THE NECK-PIVOT ALGORITHM (Giải quyết đạn bay quá đầu)
     */
    anchorCenterOfMass(player) {
        if (!player || !player.head_pos || !player.chest_pos) return; //

        if (player.center_of_mass) { //
            // Dời trọng tâm X, Z khớp với đầu
            player.center_of_mass.x = player.head_pos.x;
            player.center_of_mass.z = player.head_pos.z;
            
            // THAY ĐỔI CỐT LÕI: Khóa ở vị trí CẰM/CỔ (Golden Ratio 0.55)
            // Khi đạn SMG nảy lên, nó sẽ nảy từ Cằm -> Trán. Không bao giờ văng ra ngoài.
            const neckPivotY = player.chest_pos.y + ((player.head_pos.y - player.chest_pos.y) * 0.55);
            player.center_of_mass.y = neckPivotY;
            
            // Giới hạn an toàn tuyệt đối: Không bao giờ cho phép trọng tâm vượt qua gốc tọa độ Đầu
            player.center_of_mass.y = Math.min(player.center_of_mass.y, player.head_pos.y);
        }
    }

    process(data) {
        if (!data || typeof data !== 'object') return data;

        if (data.weapon) this.stabilizeWeapon(data.weapon);

        if (Array.isArray(data.players)) { //
            for (let i = 0; i < data.players.length; i++) { //
                const enemy = data.players[i]; //
                this.reconfigureMagnetism(enemy.hitboxes); //
                this.anchorCenterOfMass(enemy);
            }
            
            // Cấu hình lại Stickiness: Giữ ở mức 0.8 để có độ "dẻo" khi kéo theo mục tiêu di chuyển
            if (data.players.length > 0 && data.camera_state) {
                data.camera_state.stickiness = 0.8; 
                data.camera_state.interpolation = "ZERO";
                data.camera_state.aim_acceleration = 0.0;
                data.camera_state.lock_bone = "bone_Head";
            }
        }

        return data;
    }
}

// ==========================================
// THỰC THI GIAO THỨC
// ==========================================
const EngineV45 = new PrecisionAnchorEngine();

if (typeof $response !== "undefined" && $response.body) { //
    try {
        const payload = JSON.parse($response.body); //
        const finalData = EngineV45.process(payload);
        $done({ body: JSON.stringify(finalData) }); //
    } catch (e) {
        $done({ body: $response.body }); //
    }
}
