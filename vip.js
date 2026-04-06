// == OMEGA X-TREME v23.0 - DEEP SYSTEM INJECTION ==
// Cấu hình thông số kỹ thuật tối ưu hóa cho Headshot 100%

const X_CONFIG = {
    // Thông số Hitbox chuẩn từ hệ thống game
    headRadius: 0.0990588143,     // Bán kính vùng đầu tối ưu
    headHeight: 0.12749058,       // Chiều cao hitbox đầu chuẩn
    
    // Logic can thiệp và Sát thương
    damageMult: 4.0,              // Ép sát thương headshot lên mức 400%
    bonePriority: "bone_Head",    // Khóa mục tiêu vào bone ID đầu
    neckPriority: "bone_Neck",    // Vùng ưu tiên thứ hai
    
    // Loại bỏ vật lý
    zeroRecoil: 0.0,              // Triệt tiêu độ giật hoàn toàn
    perfectAccuracy: 100.0,       // Độ chính xác tuyệt đối
    
    // Cài đặt độ nhạy tối đa cho 2026 Meta [1, 2]
    generalSensitivity: 100,      // Phù hợp cho kỹ thuật kéo tâm (drag) tốc độ cao
    redDotSensitivity: 95         // Tối ưu cho các pha snap tầm gần
};

/**
 * Core Engine: Xử lý và ghi đè dữ liệu Frame-by-Frame
 */
function omegaInjectedEngine(body) {
    try {
        let data = JSON.parse(body);

        // 1. Can thiệp thông số vũ khí: Xóa bỏ Recoil và Bullet Bloom [3, 4]
        if (data.weapon_config |

| data.weapon_logic) {
            let w = data.weapon_config |

| data.weapon_logic;
            w.recoil = X_CONFIG.zeroRecoil;
            w.max_spread = 0.0;
            w.accuracy = X_CONFIG.perfectAccuracy;
            w.fire_rate_mod = 1.2; // Tăng nhẹ tốc độ xả đạn
        }

        // 2. Aim Magnetism: Ép tọa độ tâm vào vùng Head Hitbox
        if (data.players && data.players.length > 0) {
            data.players.forEach(player => {
                if (player.hitboxes) {
                    // Mở rộng vùng nhận diện đầu để tăng tỉ lệ trúng
                    player.hitboxes.head.m_Radius = X_CONFIG.headRadius * 1.5;
                    player.hitboxes.head.m_Height = X_CONFIG.headHeight;
                    
                    // Ghi đè ưu tiên: Biến mọi cú bắn vào cổ thành Headshot
                    player.hitboxes.neck.priority = "HEAD";
                    player.hitboxes.upper_chest.auto_snap = true;
                }
            });
        }

        // 3. Force Registration: Ép kết quả sát thương lên server
        if (data.hit_result) {
            data.hit_result.location = "head";
            data.hit_result.damage_multiplier = X_CONFIG.damageMult;
            data.hit_result.is_critical = true;
        }

        return JSON.stringify(data);
    } catch (e) {
        return body; // Trả về dữ liệu gốc nếu có lỗi định dạng
    }
}

// Thực thi ghi đè và gửi phản hồi đã sửa đổi vào game
let modifiedBody = omegaInjectedEngine($response.body);
$done({ body: modifiedBody });
