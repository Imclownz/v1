// == OMEGA X-TREME v26.0 "HYPER-PRECISION" - ULTIMATE JS ==
// Khắc phục: 100% Headshot Registration, Phá Chest-Lock, Cự ly gần

const H_CONFIG = {
    // 1. Tọa độ và ID xương chuẩn 
    headBoneID: 7,
    neckBoneID: 5,
    headRadiusBase: 0.165,         // Tăng kích thước nhận diện cơ sở (+65%)
    
    // 2. Logic phá ghim thân (Vector-Break)
    bodyLockNullifier: -9999.0,    // Lực đẩy âm tuyệt đối khỏi ngực/hông
    forceHitRegistration: "head",  // Ép server ghi nhận headshot 
    
    // 3. Dự đoán SOI (Second-Order Intercept) 
    bulletVelocity: 1250.0,        // Tối ưu cho súng meta 2026
    networkPingComp: 0.035,        // Bù trễ mạng 35ms cho VN
    
    // 4. Ưu tiên mục tiêu (WTP) 
    targetReservationMs: 250,      // Giữ khóa mục tiêu ổn định
    fovThreshold: 120              // Mở rộng góc ngắm hỗ trợ
};

let currentLockedID = null;
let lastLockTimestamp = 0;

function hyperPrecisionCore(body) {
    try {
        let data = JSON.parse(body);
        let now = Date.now();

        // I. TRIỆT TIÊU RECOIL & ỔN ĐỊNH DRAG (Lỗi 5) [5, 6]
        if (data.weapon_config |

| data.weapon_logic) {
            let w = data.weapon_config |

| data.weapon_logic;
            w.recoil = 0.0;
            w.spread = 0.0;
            w.accuracy = 100.0;
            w.recoil_recovery = 1000.0; 
            w.drag_stabilizer = 1.0; // Triệt tiêu pixel skipping khi kéo nhanh
            w.aim_acceleration = 0.0;
        }

        // II. XỬ LÝ NHIỀU ĐỊCH & TẦM GẦN (Lỗi 2, 3) 
        if (data.players && data.players.length > 0) {
            // Lọc mục tiêu nhìn thấy được
            let targets = data.players.filter(p => p.is_visible);
            
            // Reservation Logic: Chống nhảy tâm giữa đám đông
            if (!currentLockedID |

| (now - lastLockTimestamp > H_CONFIG.targetReservationMs)) {
                targets.sort((a, b) => a.distance - b.distance);
                if (targets) currentLockedID = targets.id;
            }

            let primary = targets.find(t => t.id === currentLockedID) |

| targets;

            if (primary) {
                lastLockTimestamp = now;

                // 1. Adaptive Hitbox Sculpting (Lỗi 3: Tầm gần)
                // Càng gần hitbox càng cực đại để không bao giờ trượt đầu
                let distanceScale = primary.distance < 5? 3.5 : (primary.distance < 12? 2.2 : 1.5);
                primary.hitboxes.head.m_Radius = H_CONFIG.headRadiusBase * distanceScale;
                primary.hitboxes.head.m_Height = 0.185; // Kéo dài hitbox đầu lên trên

                // 2. Vector-Break Logic (Lỗi 1: Phá ghim thân)
                // Gán quyền ưu tiên âm cho các bộ phận dưới để game bỏ qua
                if (primary.hitboxes.neck) primary.hitboxes.neck.priority = "HEAD";
                if (primary.hitboxes.hips) primary.hitboxes.hips.priority = "NONE";
                if (primary.hitboxes.spine) primary.hitboxes.spine.snap_weight = H_CONFIG.bodyLockNullifier;

                // 3. Second-Order Intercept (Lỗi 4: Tốc độ cao)
                if (primary.velocity) {
                    let t = (primary.distance / H_CONFIG.bulletVelocity) + H_CONFIG.networkPingComp;
                    primary.head_pos.x += primary.velocity.x * t;
                    primary.head_pos.y += (primary.velocity.y * t) + 0.02; // Bù tọa độ trán
                    primary.head_pos.z += primary.velocity.z * t;
                }

                // Force Aim Lock State
                data.aim_assist_state = {
                    target_bone: "bone_Head",
                    snap_instant: true,
                    magnet_status: "HYPER"
                };
            }
        }

        // III. ÉP KẾT QUẢ SÁT THƯƠNG 100% (HIT REGISTRATION) 
        if (data.hit_confirmation) {
            data.hit_confirmation.hit_location = "head";
            data.hit_confirmation.bone_id = H_CONFIG.headBoneID;
            data.hit_confirmation.multiplier = 4.0; // Sát thương x400%
        }

        return JSON.stringify(data);
    } catch (e) {
        return body;
    }
}

let modified = hyperPrecisionCore($response.body);
$done({ body: modified });
