/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V3 (STATIC INJECTION PROTOCOL)
 * Target: ABHotUpdates & Unity Engine Configs
 * Mode: Pre-load Payload Modification
 * ==============================================================================
 */

class StaticInjector {
    static patchPayload(payload, url) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            for (let i = 0; i < payload.length; i++) payload[i] = this.patchPayload(payload[i], url);
            return payload;
        }

        // 1. CAN THIỆP THÔNG SỐ VŨ KHÍ (RECOIL & INACCURACY)
        if (payload.damage !== undefined || payload.recoil_y !== undefined) {
            
            // Xóa bỏ hình phạt quán tính di chuyển (Module 5)
            if (payload.inaccuracy_move !== undefined) payload.inaccuracy_move = 0.0;
            if (payload.inaccuracy_jump !== undefined) payload.inaccuracy_jump = 0.0;
            if (payload.dynamic_spread !== undefined) payload.dynamic_spread = 0.0;
            
            // Ép độ giật liên thanh về mức tiệm cận 0 (Module 3)
            if (payload.recoil_y !== undefined) payload.recoil_y = 0.01; 
            if (payload.recoil_x !== undefined) payload.recoil_x = 0.0;
            
            // Đạn đạo Hitscan (Module 4)
            if (payload.bullet_speed !== undefined) payload.bullet_speed = 99999.0;
        }

        // 2. CAN THIỆP AIM-ASSIST & KHUNG XƯƠNG (MODULE 2 & 6)
        if (payload.magnetism !== undefined) payload.magnetism = 9999.0;
        
        if (payload.hitboxes !== undefined) {
            if (payload.hitboxes.head !== undefined) {
                if (payload.hitboxes.head.radius !== undefined) payload.hitboxes.head.radius *= 50.0;
            }
            if (payload.hitboxes.chest !== undefined) {
                if (payload.hitboxes.chest.radius !== undefined) payload.hitboxes.chest.radius = 0.01;
            }
        }

        const keys = Object.keys(payload);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (payload[key] && typeof payload[key] === 'object') {
                payload[key] = this.patchPayload(payload[key], url);
            }
        }

        return payload;
    }
}

if (typeof $response !== "undefined" && $response.body) {
    const url = $request.url;
    // Bắt và phân tích nội dung file Config (Chỉ chạy lúc Loading Game)
    if ($response.body.startsWith('{') || $response.body.startsWith('[')) {
        try {
            const payload = JSON.parse($response.body);
            const mutated = StaticInjector.patchPayload(payload, url);
            $done({ body: JSON.stringify(mutated) });
        } catch (e) {
            $done({ body: $response.body }); 
        }
    } else {
        $done({ body: $response.body }); 
    }
}
