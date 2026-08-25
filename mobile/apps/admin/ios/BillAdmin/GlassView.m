#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

@interface BillAdminGlassView : UIView
@property(nonatomic, strong) NSNumber *intensity;
@property(nonatomic, strong) UIVisualEffectView *blurView;
@end

@implementation BillAdminGlassView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _intensity = @0.92;
    self.opaque = NO;
    self.clipsToBounds = YES;
    self.blurView = [[UIVisualEffectView alloc] initWithEffect:nil];
    self.blurView.opaque = NO;
    self.blurView.userInteractionEnabled = NO;
    self.blurView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self insertSubview:self.blurView atIndex:0];
    [self updateEffect];
  }
  return self;
}

- (void)setIntensity:(NSNumber *)intensity {
  _intensity = intensity ?: @0.92;
  [self updateEffect];
}

- (void)updateEffect {
  self.backgroundColor = UIColor.clearColor;
  self.blurView.backgroundColor = UIColor.clearColor;
  self.blurView.effect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleSystemMaterial];
  self.blurView.alpha = MIN(MAX(self.intensity.doubleValue, 0.0), 1.0);
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.blurView.frame = self.bounds;
  self.blurView.layer.cornerRadius = self.layer.cornerRadius;
  self.blurView.clipsToBounds = YES;
}

- (void)traitCollectionDidChange:(UITraitCollection *)previousTraitCollection {
  [super traitCollectionDidChange:previousTraitCollection];
  if (@available(iOS 13.0, *)) {
    if ([self.traitCollection hasDifferentColorAppearanceComparedToTraitCollection:previousTraitCollection]) {
      [self updateEffect];
    }
  }
}

@end

@interface GlassViewManager : RCTViewManager
@end

@implementation GlassViewManager

RCT_EXPORT_MODULE(GlassView)

- (UIView *)view {
  return [BillAdminGlassView new];
}

RCT_EXPORT_VIEW_PROPERTY(intensity, NSNumber)

@end
