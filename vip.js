/**
 * ==============================================================================
 * PROJECT: OMNI-MATRIX V4 (BINARY HEX-INJECTOR)
 * Target: global-metadata.dat & ABHotUpdates Binary Files
 * Method: On-the-fly String Pool Manipulation & Null Padding (Fill Zero)
 * ==============================================================================
 */

class BinaryPatcher {
    
    // Hàm thay thế chuỗi và tự động điền byte 00 (Fill Zero) để giữ nguyên dung lượng file
    static replaceAndPad(body, oldStr, newStr) {
        if (body.indexOf(oldStr) === -1) return body; // Không tìm thấy thì bỏ qua
        
        let paddedNewStr = newStr;
        const lengthDiff = oldStr.length - newStr.length;
        
        // Nếu chuỗi mới ngắn hơn, nhồi thêm ký tự Null (\x00) vào đuôi
        if (lengthDiff > 0) {
            paddedNewStr += "\x00".repeat(lengthDiff);
        } else if (lengthDiff < 0) {
            // Nếu chuỗi mới dài hơn, cắt bớt để tránh làm Crash game
            paddedNewStr = newStr.substring(0, oldStr.length);
        }

        // Thực hiện ghi đè toàn bộ trong file nhị phân
        return body.split(oldStr).join(paddedNewStr);
    }

    // Hàm xóa sổ hoàn toàn một chuỗi bằng các byte Null (00)
    static wipeString(body, targetStr) {
        if (body.indexOf(targetStr) === -1) return body;
        const nullBytes = "\x00".repeat(targetStr.length);
        return body.split(targetStr).join(nullBytes);
    }

    static execute(body) {
        let mutatedBody = body;

        // ========================================================================
        // 1. AIMLOCK / pSILENT (BONE REDIRECTION)
        // Lừa Engine game: Nhận diện Xương Chậu (Hips) thành Xương Cổ (Neck)
        // Khi đạn bay vào bụng, hệ thống tính sát thương vào Cổ/Đầu.
        // ========================================================================
        mutatedBody = this.replaceAndPad(mutatedBody, "bone_Hips", "bone_Neck");
        mutatedBody = this.replaceAndPad(mutatedBody, "BONE_PELVIS", "BONE_HEAD");

        // ========================================================================
        // 2. MAGIC BULLET / HITBOX EXPANDER (ĐẠN MA THUẬT)
        // Biến Collider (thể tích va chạm) của kẻ địch thành một cột Airdrop Laser.
        // Cột Laser này to ngang cả một cái nhà, bắn trúng cột = trúng địch.
        // ========================================================================
        const collidersToMutate = [
            "INGAME_PLAYER_SNIPER_COLLIDER",
            "INGAME_PLAYER_COLLIDER"
        ];
        
        collidersToMutate.forEach(collider => {
            // Đổi thành cột sáng Laser của hòm thính (To và dài)
            mutatedBody = this.replaceAndPad(mutatedBody, collider, "INGAME_AIRDROP_LASER");
        });

        // ========================================================================
        // 3. ANTI-REPORT / BAN NULLIFICATION (TƯỚC VŨ KHÍ CỦA ANTI-CHEAT)
        // Xóa trắng toàn bộ các lệnh gửi báo cáo. Khi AI game định khóa nick,
        // nó gọi hàm này, nhưng hàm đã biến thành khoảng trắng -> Treo lệnh cấm.
        // ========================================================================
        const reportStrings = [
            "T_34_XH_REPORT_HACKKILL",
            "EVENT_TYPE_REPORT_CHEAT",
            "T_33_XH_REPORT_FAILEDSUBMIT",
            "TXT_REPORT_CHEATING",
            "T_31_JQ_CHEAT_AIMBOT",
            "T_31_JQ_CHEAT_WALLHACK",
            "T_33_XH_REPORT_TARGET1",
            "T_43_ZZ_REPORT_DAMAGE"
        ];

        reportStrings.forEach(str => {
            mutatedBody = this.wipeString(mutatedBody, str);
        });

        // ========================================================================
        // 4. ENVIRONMENT MANIPULATION (XÓA VẬT CẢN)
        // Biến cửa hoặc một số vật cản thành khoảng không (Wallhack cơ bản)
        // ========================================================================
        mutatedBody = this.replaceAndPad(mutatedBody, "INGAME_DESTRUCTIBLE_WHITEDOOR001", "\x00".repeat(32));

        return mutatedBody;
    }
}

// ============================================================================
// BỘ KÍCH HOẠT SHADOWROCKET (BẮT GÓI TIN LÚC LOADING)
// ============================================================================
if (typeof $response !== "undefined" && $response.body) {
    try {
        // Chỉ chạy nếu gói tin đủ lớn (loại trừ các request vớ vẩn)
        if ($response.body.length > 1000) {
            let patchedBody = BinaryPatcher.execute($response.body);
            $done({ body: patchedBody });
        } else {
            $done({ body: $response.body });
        }
    } catch (e) {
        $done({ body: $response.body }); // Cứu hộ an toàn nếu lỗi
    }
} else {
    $done();
}
