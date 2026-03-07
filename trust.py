import cv2
import sys


def main():
    # ======================================================================
    # SETUP: Install an IP camera app on your phone, then set the URL below.
    #
    # Android: "IP Webcam" app → Start Server → use the URL shown, e.g.:
    #          http://192.168.x.x:8080/video
    #
    # iOS:    "EpocCam" or any RTSP camera app.
    #
    # Make sure your phone and computer are on the SAME Wi-Fi network.
    # ======================================================================

    # Replace with your phone's camera stream URL
    PHONE_CAMERA_URL = "https://25.143.112.102:8080"

    if len(sys.argv) > 1:
        PHONE_CAMERA_URL = sys.argv[1]

    print(f"Connecting to phone camera at: {PHONE_CAMERA_URL}")
    print("Press 'q' to quit.")

    cap = cv2.VideoCapture(PHONE_CAMERA_URL)

    if not cap.isOpened():
        print("\n❌ Could not connect to the camera.")
        print("Please check:")
        print("  1. Your phone and computer are on the same Wi-Fi network.")
        print("  2. The IP camera app is running on your phone.")
        print(f"  3. The URL is correct: {PHONE_CAMERA_URL}")
        print("\nUsage:  python trust.py <camera_url>")
        print("Example: python trust.py http://192.168.1.100:8080/video")
        sys.exit(1)

    print("✅ Connected! Streaming video...")

    while True:
        ret, frame = cap.read()

        if not ret:
            print("⚠️  Lost connection to camera. Retrying...")
            cap.release()
            cap = cv2.VideoCapture(PHONE_CAMERA_URL)
            continue

        # Display the frame
        cv2.imshow("Phone Camera", frame)

        # Press 'q' to quit
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Stream ended.")


if __name__ == "__main__":
    main()
