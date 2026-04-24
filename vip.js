/**
 * ==============================================================================
 * QUANTUM REACH v50-GOLDEN (THE SWEET SPOT)
 * Architecture: Recursive Schema-Agnostic Engine + v50 Core Mathematics
 * Optimization: High-speed Linear Execution, Zero-Latency Shadowrocket Proxy
 * ==============================================================================
 */

class QuantumMath {
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Trả lại công thức Tuyến tính chia bậc siêu tốc của v50
    static calculateAdaptiveYOffset(distance) {
        if (distance <= 10.0) return 0.68;
        if (distance <= 40.0) {
            const scale = (distance - 10.0) / 30.0;
            return 0.68 - (0.33 * scale);
        }
        if (distance <= 80.0) return 0.35;
        return 0.15;
    }

    // Trả lại thuật toán Intercept chính xác của v50 (Không thêm Base Delay)
    static predictIntercept(targetPos, targetVel, selfVel, distance, pingMs) {
        const BULLET_SPEED = 9999.0;
        const timeOffset = (distance / BULLET_SPEED) + (pingMs / 1000.0) + 0.02;
        return {
            x: targetPos.x + ((targetVel.x - selfVel.x) * timeOffset),
            y: targetPos.y + ((targetVel.y - selfVel.y) * timeOffset),
            z: targetPos.z + ((targetVel.z - selfVel.z) * timeOffset)
        };
    }
}

class QuantumGoldenEngine {
    constructor() {
        this.voidWeight = -99999.0;
        this.singularityWeight = 99999.0;
        
        // Trả lại danh sách triệt tiêu nguyên bản của v50 (Không thêm sway/recovery)
        this.nullifyKeys = new Set([
            'recoil', 'spread', 'camera_shake', 'progressive_spread', 
            'recoil_accumulation', 'recoil_multiplier', 'horizontal_recoil', 
            'vertical_recoil', 'bloom', 'movement_penalty', 'jump_penalty', 'strafe_penalty'
        ]);
        
        // Chỉ giới hạn ở các xương thân thiết yếu của v50
        this.torsoBones = new Set([
            'root', 'spine', 'spine1', 'spine2', 'chest', 
            'pelvis', 'hips', 'left_arm', 'right_arm', 'left_leg', 'right_leg'
        ]);
    }

    // Dùng lõi Đệ quy của v51 để chống update OB, nhưng thực thi toán học v50
    processRecursive(obj, selfVel = {x: 0, y: 0, z: 0}, ping = 20, dist = 15.0) {
        if (typeof obj !== 'object' || obj === null) return obj;

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (obj[i] && obj[i].distance) dist = obj[i].distance;
                obj[i] = this.processRecursive(obj[i], selfVel, ping, dist);
            }
            return obj;
        }

        if ('distance' in obj) dist = obj.distance;
        if ('player_velocity' in obj) selfVel = obj.player_velocity;
        if ('ping' in obj) ping = obj.ping;

        for (const key of Object.keys(obj)) {
            if (this.nullifyKeys.has(key)) {
                obj[key] = 0.0;
            }
        }

        if ('aim_assist_range' in obj) obj.aim_assist_range = 9999.0;
        if ('auto_aim_angle' in obj) obj.auto_aim_angle = 360.0;
        if ('bullet_speed' in obj) obj.bullet_speed = 9999.0;

        for (const boneName of Object.keys(obj)) {
            if (this.torsoBones.has(boneName) && obj[boneName] && typeof obj[boneName] === 'object' && 'snap_weight' in obj[boneName]) {
                obj[boneName].snap_weight = this.voidWeight;
                obj[boneName].priority = "IGNORE";
                obj[boneName].m_Radius = dist < 12.0 ? 0.0001 : 0.01;
                obj[boneName].friction = 0.0; 
            }
            
            if (boneName === 'head' && obj[boneName] && typeof obj[boneName] === 'object' && 'snap_weight' in obj[boneName]) {
                // Trả lại hệ số nhân Hitbox ổn định của v50
                let headMultiplier = dist < 15.0 ? 15.0 : (dist > 50.0 ? 4.0 : 8.0);
                obj[boneName].snap_weight = this.singularityWeight;
                obj[boneName].priority = "MAXIMUM";
                obj[boneName].m_Radius *= headMultiplier;
                obj[boneName].vertical_magnetism_multiplier = 10.0; // Trả về thông số v50 (10.0 thay vì 25.0)
                obj[boneName].friction = 0.0;
            }

            if (boneName === 'neck' && obj[boneName] && typeof obj[boneName] === 'object' && 'snap_weight' in obj[boneName]) {
                obj[boneName].snap_weight = this.singularityWeight * 0.5;
                obj[boneName].priority = "HIGH";
                obj[boneName].friction = 0.0;
            }
        }

        if (obj.center_of_mass && obj.head_pos && obj.chest_pos) {
            const targetVel = obj.velocity || { x: 0, y: 0, z: 0 };
            
            // Chạy thuật toán của v50
            const predictedPos = QuantumMath.predictIntercept(obj.head_pos, targetVel, selfVel, dist, ping);
            const adaptiveY = QuantumMath.calculateAdaptiveYOffset(dist);

            obj.center_of_mass.x = predictedPos.x;
            obj.center_of_mass.z = predictedPos.z;
            obj.center_of_mass.y = obj.chest_pos.y + adaptiveY;
            
            // Giới hạn an toàn của v50
            const safetyCeiling = obj.head_pos.y + (dist > 40.0 ? 0.05 : 0.15);
            obj.center_of_mass.y = QuantumMath.clamp(obj.center_of_mass.y, obj.chest_pos.y, safetyCeiling);
        }

        if (obj.camera_state) {
            obj.camera_state.stickiness = 1.0;
            obj.camera_state.interpolation = "ZERO";
            obj.camera_state.aim_acceleration = 0.0;
            obj.camera_state.lock_bone = "bone_Head";
        }

        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (key !== 'center_of_mass' && key !== 'head_pos' && key !== 'chest_pos' && key !== 'velocity') {
                    obj[key] = this.processRecursive(obj[key], selfVel, ping, dist);
                }
            }
        }

        return obj;
    }
}

// ==============================================================================
// EXECUTION BLOCK
// ==============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        const Engine = new QuantumGoldenEngine();
        const mutatedPayload = Engine.processRecursive(payload);
        $done({ body: JSON.stringify(mutatedPayload) });
    } catch (error) {
        $done({ body: $response.body });
    }
}
